import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit, checkReplay, requestFingerprint } from './audit.server';
import { collections } from './collections.server';

import type { z } from 'zod';
import type { createProductSchema, quoteSchema, updateProductSchema } from './contracts';
import type { Product } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const productDto = (product: Product, admin = false) => ({
  id: product._id.toHexString(), sku: product.sku, name: product.name, shortDescription: product.shortDescription,
  price: product.price, salesEnabled: product.salesEnabled, version: product.version,
  availableQuantity: product.inventory.stockQuantity - product.inventory.reservedQuantity,
  ...(admin ? { inventory: product.inventory, updatedAt: product.updatedAt.toISOString() } : {}),
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
    inventory: { stockQuantity: input.stockQuantity, reservedQuantity: 0 }, salesEnabled: input.salesEnabled,
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
  if (input.stockQuantity !== undefined && input.stockQuantity < current.inventory.reservedQuantity) {
    fail(409, 'STOCK_RESERVED', 'Stock cannot be lower than the reserved quantity.');
  }

  const updated: Product = {
    ...current,
    name: input.name ?? current.name,
    shortDescription: input.shortDescription ?? current.shortDescription,
    price: { currency: 'USD', unitAmount: input.unitAmount ?? current.price.unitAmount },
    inventory: { ...current.inventory, stockQuantity: input.stockQuantity ?? current.inventory.stockQuantity },
    salesEnabled: input.salesEnabled ?? current.salesEnabled,
    version: current.version + 1, updatedAt: new Date(), updatedBy: adminId,
  };

  const result = await products.replaceOne({ _id: current._id, version: input.version }, updated, { session });
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

  const items = input.items.map(item => {
    const product = products.find(value => value.sku === item.sku);
    if (!product || !product.salesEnabled) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');
    if (product.inventory.stockQuantity - product.inventory.reservedQuantity < item.quantity) {
      fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');
    }
    const lineSubtotal = product.price.unitAmount * item.quantity;
    if (!Number.isSafeInteger(lineSubtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
    return {
      sku: item.sku, quantity: item.quantity, unitAmount: product.price.unitAmount,
      lineSubtotal, productVersion: product.version,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
  if (!Number.isSafeInteger(subtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
  return {
    items, currency: 'USD',
    pricing: { state: 'estimated', subtotal, discount: 0, shipping: null, tax: null, total: null },
    checkoutReady: false,
  };
};
