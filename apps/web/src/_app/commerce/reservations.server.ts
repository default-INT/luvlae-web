import 'server-only';

import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { randomToken } from '@/shared/lib/security/index.server';

import { appendAudit, requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { integerSchema, skuSchema, versionSchema } from './contracts';

import type { Order } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

const hash = z.string().regex(/^[a-f0-9]{64}$/);

const reservationSchema = z.strictObject({
  creationKeyHash: hash, guestTokenHash: hash, guestAccessExpiresAt: z.date(),
  expiresAt: z.date(), livemode: z.boolean(),
  pricingPolicy: z.strictObject({ shipping: z.string().min(1), tax: z.string().min(1), discount: z.literal('none-v1') }),
  items: z.array(z.strictObject({ sku: skuSchema, quantity: integerSchema.min(1).max(99), productVersion: versionSchema }))
    .min(1).max(20),
}).refine(value => new Set(value.items.map(item => item.sku)).size === value.items.length);

// A server use case, not an HTTP route. Provider setup/reconciliation is deliberately a separate integration.
// The caller supplies approved policies/expiry and guest-scoped key hashes; no default sales terms are invented.
export const reserveOrder = async (context: DatabaseContext, input: z.infer<typeof reservationSchema>) => {
  const value = reservationSchema.parse(input);
  if (value.expiresAt.getTime() <= Date.now() || value.guestAccessExpiresAt.getTime() <= Date.now()) {
    fail(400, 'INVALID_EXPIRATION', 'Reservation and access expiration must be in the future.');
  }

  const requestHash = requestFingerprint({
    items: value.items, pricingPolicy: value.pricingPolicy, livemode: value.livemode,
    guestTokenHash: value.guestTokenHash,
  });

  return inTransaction(context, async session => {
    const { products, orders, attempts } = collections(context.db);
    const existing = await orders.findOne({ creationKeyHash: value.creationKeyHash }, { session });
    if (existing) {
      if (existing.creationRequestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request contents changed.');
      return { orderId: existing._id, attemptId: existing.payment.activeAttemptId, replayed: true };
    }
    const now = new Date();
    const orderId = new ObjectId();
    const attemptId = new ObjectId();
    const items: Order['items'] = [];

    // Sequential DB calls: MongoDB does not support parallel operations within a transaction.
    for (const requested of value.items) {
      const product = await products.findOne({ sku: requested.sku }, { session });
      if (!product || !product.salesEnabled) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');
      if (product.version !== requested.productVersion) fail(409, 'PRICE_CHANGED', 'Confirm the updated product offer.');

      const reserved = await products.updateOne({
        _id: product._id, version: requested.productVersion, salesEnabled: true,
        $expr: { $gte: [{ $subtract: ['$inventory.stockQuantity', '$inventory.reservedQuantity'] }, requested.quantity] },
      }, { $inc: { 'inventory.reservedQuantity': requested.quantity }, $set: { updatedAt: now } }, { session });

      if (!reserved.modifiedCount) fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');
      const lineSubtotal = product.price.unitAmount * requested.quantity;
      if (!Number.isSafeInteger(lineSubtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
      items.push({
        productId: product._id, sku: product.sku, name: product.name, quantity: requested.quantity,
        unitAmount: product.price.unitAmount, lineSubtotal, productVersion: product.version,
      });
    }
    const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);
    if (!Number.isSafeInteger(subtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
    const pricing: Order['pricing'] = { state: 'estimated', subtotal, discount: 0, shipping: null, tax: null, total: null };

    const order: Order = {
      _id: orderId, schemaVersion: 1, version: 1, orderNumber: `LV-${randomToken().slice(0, 16).toUpperCase()}`,
      creationKeyHash: value.creationKeyHash, creationRequestHash: requestHash,
      guestAccess: { tokenHash: value.guestTokenHash, expiresAt: value.guestAccessExpiresAt },
      items, currency: 'USD', pricing, pricingPolicy: value.pricingPolicy, orderStatus: 'open',
      payment: {
        status: 'pending', activeAttemptId: attemptId, amountPaid: 0, amountRefunded: 0,
        disputed: false, reconciliationRequired: false,
      },
      fulfillment: { status: 'unfulfilled' }, restockedQuantities: {}, notifications: [], createdAt: now, updatedAt: now,
    };

    await orders.insertOne(order, { session });
    await attempts.insertOne({
      _id: attemptId, schemaVersion: 1, orderId, requestKeyHash: value.creationKeyHash, requestHash,
      stripeIdempotencyKey: `checkout-${attemptId.toHexString()}`, state: 'creating', active: true,
      quoteSnapshot: { items, currency: 'USD', pricing, pricingPolicy: value.pricingPolicy },
      inventoryReservation: {
        state: 'held', items: items.map(item => ({ productId: item.productId, quantity: item.quantity })),
        expiresAt: value.expiresAt,
      },
      livemode: value.livemode, createdAt: now, updatedAt: now,
    }, { session });
    await appendAudit(context.db, session, {
      operationId: `reserve-${attemptId.toHexString()}`, requestHash, actor: { type: 'system' },
      entityType: 'order', entityId: orderId, action: 'order.reserve',
      changes: { items: items.map(item => ({ sku: item.sku, quantity: item.quantity })) },
    });
    return { orderId, attemptId, replayed: false };
  });
};
