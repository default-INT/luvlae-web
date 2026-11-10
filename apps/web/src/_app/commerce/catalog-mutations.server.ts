import 'server-only';

import { randomUUID } from 'node:crypto';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit, checkReplay, requestFingerprint } from './audit.server';
import { collections } from './collections.server';

import type { ObjectId } from 'mongodb';
import type { z } from 'zod';
import type {
  createOfferSchema, updateOfferSchema, duplicateOfferSchema, storefrontSchema, inventoryAdjustmentSchema,
} from './contracts';
import type { Product, ProductOfferRecord } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

type Mutation = { version: number; operationId: string; reason: string };

const catalogMutation = async (
  context: DatabaseContext, adminId: ObjectId, sku: string, action: string, input: Mutation,
  mutate: (product: Product) => { fields: Partial<Product>; offerId?: string }, extra: object = {},
) => inTransaction(context, async session => {
  const requestHash = requestFingerprint({ action, actor: adminId.toHexString(), sku, input, ...extra });
  const replay = await checkReplay(context.db, session, input.operationId, requestHash);

  if (replay) { return { id: replay.entityId.toHexString(),
    ...replay.changes.result as { version: number; offerId?: string }, replayed: true }; }

  const { products } = collections(context.db);
  const product = await products.findOne({ sku }, { session });

  if (!product) return fail(404, 'NOT_FOUND', 'Product not found.');

  if (product.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the product before editing.');

  const { fields, offerId } = mutate(product);
  const result = { version: product.version + 1, ...(offerId ? { offerId } : {}) };

  const update = await products.updateOne({ _id: product._id, version: input.version }, {
    $set: { ...fields, updatedAt: new Date(), updatedBy: adminId }, $inc: { version: 1 },
  }, { session });

  if (!update.modifiedCount) fail(409, 'VERSION_CONFLICT', 'Reload the product before editing.');

  const before = Object.fromEntries(Object.keys(fields).map(key => [key, product[key as keyof Product]]));
  await appendAudit(context.db, session, { operationId: input.operationId, requestHash,
    actor: { type: 'admin', id: adminId }, entityType: 'product', entityId: product._id, action,
    reason: input.reason, changes: { before, after: fields, result } });
  return { id: product._id.toHexString(), ...result, replayed: false };
});

const ensureCapacity = (offers: ProductOfferRecord[]) => {
  if (offers.length >= 100 || offers.filter(offer => offer.status !== 'archived').length >= 20) {
    fail(409, 'OFFER_LIMIT', 'The product offer limit has been reached.');
  }
};

export const createOffer = (context: DatabaseContext, adminId: ObjectId, sku: string, input: z.infer<typeof createOfferSchema>) =>
  catalogMutation(context, adminId, sku, 'offer.create', input, product => {
    const offers = product.offers ?? [];
    ensureCapacity(offers);

    const offer: ProductOfferRecord = { id: randomUUID(), unitsPerPack: input.unitsPerPack,
      price: { currency: 'USD', unitAmount: input.unitAmount }, sortOrder: input.sortOrder,
      status: 'draft', createdAt: new Date(), updatedAt: new Date() };

    return { fields: { offers: [...offers, offer] }, offerId: offer.id };
  });

export const updateOffer = (context: DatabaseContext, adminId: ObjectId, sku: string, offerId: string,
  input: z.infer<typeof updateOfferSchema>) => catalogMutation(context, adminId, sku, 'offer.update', input, product => {
  const offers = product.offers ?? [];
  const current = offers.find(offer => offer.id === offerId);

  if (!current) return fail(404, 'NOT_FOUND', 'Offer not found.');

  if (current.status === 'archived' || (current.status === 'active' && input.status === 'draft')) {
    fail(409, 'OFFER_TRANSITION', 'This offer cannot make the requested transition.');
  }

  const updated = { ...current, unitsPerPack: input.unitsPerPack ?? current.unitsPerPack,
    price: { currency: 'USD' as const, unitAmount: input.unitAmount ?? current.price.unitAmount },
    sortOrder: input.sortOrder ?? current.sortOrder, status: input.status ?? current.status, updatedAt: new Date() };

  const storefront = product.storefront;
  return { offerId, fields: { offers: offers.map(offer => offer.id === offerId ? updated : offer),
    ...(updated.status === 'archived' && storefront ? { storefront: { ...storefront,
      homeOfferIds: storefront.homeOfferIds.filter(id => id !== offerId),
      highlightedOfferId: storefront.highlightedOfferId === offerId ? null : storefront.highlightedOfferId } } : {}) } };
}, { offerId });

export const duplicateOffer = (context: DatabaseContext, adminId: ObjectId, sku: string, offerId: string,
  input: z.infer<typeof duplicateOfferSchema>) => catalogMutation(context, adminId, sku, 'offer.duplicate', input, product => {
  const offers = product.offers ?? [];
  ensureCapacity(offers);
  const current = offers.find(offer => offer.id === offerId);

  if (!current) return fail(404, 'NOT_FOUND', 'Offer not found.');

  const copy = { ...current, id: randomUUID(), status: 'draft' as const, createdAt: new Date(), updatedAt: new Date() };
  return { fields: { offers: [...offers, copy] }, offerId: copy.id };
}, { offerId });

export const updateStorefront = (context: DatabaseContext, adminId: ObjectId, sku: string,
  input: z.infer<typeof storefrontSchema>) => catalogMutation(context, adminId, sku, 'storefront.update', input, product => {
  for (const id of input.homeOfferIds) {
    if (id !== 'standard' && !(product.offers ?? []).some(offer => offer.id === id && offer.status === 'active')) {
      fail(409, 'OFFER_UNAVAILABLE', 'Only published offers can appear on the home page.');
    }
  }

  return { fields: { storefront: { homeOfferIds: input.homeOfferIds,
    highlightedOfferId: input.highlightedOfferId, highlightBadge: input.highlightBadge } } };
});

export const adjustInventory = (context: DatabaseContext, adminId: ObjectId, sku: string,
  input: z.infer<typeof inventoryAdjustmentSchema>) => inTransaction(context, async session => {
  const requestHash = requestFingerprint({ action: 'inventory.adjust', actor: adminId.toHexString(), sku, input });
  const replay = await checkReplay(context.db, session, input.operationId, requestHash);

  if (replay) { return { id: replay.entityId.toHexString(),
    ...replay.changes.result as { inventoryVersion: number }, replayed: true }; }

  const { products } = collections(context.db);
  const product = await products.findOne({ sku }, { session });

  if (!product) return fail(404, 'NOT_FOUND', 'Product not found.');

  if ((product.inventory.version ?? 1) !== input.expectedInventoryVersion) {
    fail(409, 'INVENTORY_VERSION_CONFLICT', 'Reload inventory before adjusting stock.');
  }

  const stockQuantity = input.mode === 'set' ? input.quantity : product.inventory.stockQuantity + input.quantity;

  if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) fail(400, 'INVALID_QUANTITY', 'Invalid stock quantity.');

  if (stockQuantity < product.inventory.reservedQuantity)
  { fail(409, 'STOCK_RESERVED', 'Stock cannot be lower than reserved quantity.'); }

  const inventory = { ...product.inventory, stockQuantity, version: (product.inventory.version ?? 1) + 1 };
  const result = { inventoryVersion: inventory.version };
  await products.updateOne({ _id: product._id }, { $set: { inventory, updatedAt: new Date(), updatedBy: adminId } }, { session });
  await appendAudit(context.db, session, { operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'product', entityId: product._id, action: 'inventory.adjust', reason: input.reason,
    changes: { before: product.inventory, after: inventory, result } });
  return { id: product._id.toHexString(), ...result, replayed: false };
});
