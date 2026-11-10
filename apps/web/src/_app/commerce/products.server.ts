import 'server-only';

import { ObjectId } from 'mongodb';

import { publicStorefront } from '@/entities/product';
import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit, checkReplay, requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { calculateOfferItems, publicOffers } from './offer-calculator.server';

import type { z } from 'zod';
import type { createProductSchema, quoteSchema, updateProductSchema } from './contracts';
import type { Product } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const productDto = (product: Product, admin = false) => ({
  id: product._id.toHexString(), sku: product.sku, name: product.name, shortDescription: product.shortDescription,
  price: product.price, salesEnabled: product.salesEnabled, version: product.version,
  availableQuantity: product.inventory.stockQuantity - product.inventory.reservedQuantity,
  ...(!admin ? { purchaseOffers: publicOffers(product).map(({ id, ...offer }) => ({ offerId: id, ...offer })),
    ...(product.storefront ? { storefront: publicStorefront(product) } : {}) } : {}),
  ...(admin ? {
    inventory: product.inventory,
    ...(product.offers ? { offers: product.offers.map(offer => ({
      ...offer, createdAt: offer.createdAt.toISOString(), updatedAt: offer.updatedAt.toISOString(),
    })) } : {}),
    ...(product.storefront ? { storefront: product.storefront } : {}),
    updatedAt: product.updatedAt.toISOString(),
  } : {}),
});

export const createProduct = async (
  context: DatabaseContext, adminId: ObjectId, input: z.infer<typeof createProductSchema>,
) => inTransaction(context, async session => {
  const { products } = collections(context.db);
  const requestHash = requestFingerprint({ action: 'product.create', actor: adminId.toHexString(), input });
  const replay = await checkReplay(context.db, session, input.operationId, requestHash);

  if (replay) return { id: replay.entityId.toHexString(), replayed: true };

  const now = new Date();

  const product: Product = {
    _id: new ObjectId(), schemaVersion: 1, sku: input.sku, name: input.name,
    shortDescription: input.shortDescription, price: { currency: 'USD', unitAmount: input.unitAmount },
    inventory: { stockQuantity: input.stockQuantity, reservedQuantity: 0, version: 1 },
    offers: [], salesEnabled: input.salesEnabled,
    version: 1, createdAt: now, updatedAt: now, updatedBy: adminId,
  };

  await products.insertOne(product, { session });
  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'product', entityId: product._id, action: 'product.create', changes: { after: productDto(product, true) },
  });
  return { id: product._id.toHexString(), replayed: false };
});

export const updateProduct = async (
  context: DatabaseContext, adminId: ObjectId, sku: string, input: z.infer<typeof updateProductSchema>,
) => inTransaction(context, async session => {
  const { products } = collections(context.db);
  const requestHash = requestFingerprint({ action: 'product.update', actor: adminId.toHexString(), sku, input });
  const replay = await checkReplay(context.db, session, input.operationId, requestHash);

  if (replay) return { id: replay.entityId.toHexString(), replayed: true };

  const current = await products.findOne({ sku }, { session });

  if (!current) return fail(404, 'NOT_FOUND', 'Product not found.');

  if (current.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the product before editing.');

  if (input.stockQuantity !== undefined) {
    fail(409, 'INVENTORY_ADJUSTMENT_REQUIRED', 'Use the inventory adjustment endpoint to change stock.');
  }

  const fields = {
    name: input.name ?? current.name,
    shortDescription: input.shortDescription ?? current.shortDescription,
    price: { currency: 'USD' as const, unitAmount: input.unitAmount ?? current.price.unitAmount },
    salesEnabled: input.salesEnabled ?? current.salesEnabled,
    updatedAt: new Date(), updatedBy: adminId,
  };

  const updated = { ...current, ...fields, version: current.version + 1 };

  const result = await products.updateOne({ _id: current._id, version: input.version }, {
    $set: fields, $inc: { version: 1 },
  }, { session });

  if (!result.modifiedCount) fail(409, 'VERSION_CONFLICT', 'Reload the product before editing.');

  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'product', entityId: current._id, action: 'product.update', reason: input.reason,
    changes: { before: productDto(current, true), after: productDto(updated, true) },
  });
  return { id: current._id.toHexString(), replayed: false };
});

export const calculateQuote = async (context: DatabaseContext, input: z.infer<typeof quoteSchema>) => {
  const products = await collections(context.db).products.find({ sku: { $in: input.items.map(item => item.sku) } }).toArray();

  const calculated = calculateOfferItems(products, input.cartFormat !== undefined
    ? input.items : input.items.map(item => ({ ...item, offerId: 'standard' })));

  const items = input.cartFormat !== undefined ? calculated.map(({ productId: _productId, ...item }) => item)
    : calculated.map(({ sku, quantity, unitAmount, lineSubtotal, productVersion }) => ({
      sku, quantity, unitAmount, lineSubtotal, productVersion,
    }));

  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);

  if (!Number.isSafeInteger(subtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');

  return {
    ...(input.cartFormat !== undefined ? { cartFormat: input.cartFormat } : {}),
    items, currency: 'USD',
    pricing: { state: 'estimated', subtotal, discount: 0, shipping: null, tax: null, total: null },
    checkoutReady: false,
  };
};
