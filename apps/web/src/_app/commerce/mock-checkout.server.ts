import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { hashToken, randomToken } from '@/shared/lib/security/index.server';

import { appendAudit, requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { enqueueOrderNotification } from './notifications.server';
import { calculateOfferItems } from './offer-calculator.server';
import { readActiveSalesTerms } from './sales-terms.server';
import { aggregateInventoryItems, requirePackSchema } from './inventory-items.server';
import { requireShippingSchema } from './shipping-migration.server';
import { checkoutRequestSchema } from './contracts';

import type { z } from 'zod';
import type { Order } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const mockCheckoutSchema = checkoutRequestSchema;

export const requireMockCheckout = () => {
  if (process.env.MOCK_CHECKOUT_ENABLED !== 'true') {
    fail(503, 'MOCK_CHECKOUT_DISABLED', 'Test checkout is not enabled.');
  }
};

// Temporary paid-order simulation. Never writes invented Stripe events or financial transactions.
export const createMockOrder = async (context: DatabaseContext, input: z.infer<typeof mockCheckoutSchema>) => {
  requireMockCheckout();
  const value = mockCheckoutSchema.parse(input);
  const creationKeyHash = hashToken(`mock:${value.guestToken}:${value.operationId}`);

  const requestHash = requestFingerprint({ mode: 'mock', items: value.items,
    ...(value.cartFormat !== undefined ? { cartFormat: value.cartFormat } : {}),
    ...(value.cartFormat === 'packs-v2' ? { shippingAddress: value.shippingAddress } : {}) });

  return inTransaction(context, async session => {
    const { products, orders, attempts } = collections(context.db);
    const existing = await orders.findOne({ creationKeyHash }, { session });

    if (existing) {
      if (existing.creationRequestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request contents changed.');

      return { id: existing._id.toHexString(), replayed: true };
    }

    const shippingAddress = value.cartFormat === 'packs-v2' ? value.shippingAddress
      : fail(409, 'CHECKOUT_RELOAD_REQUIRED', 'Reload your cart to provide a delivery address.');

    await requireShippingSchema(context.db, session);
    const now = new Date();
    const salesTerms = readActiveSalesTerms(now);
    const orderId = new ObjectId();
    const attemptId = new ObjectId();
    const items: Order['items'] = [];

    if (value.cartFormat !== undefined) {
      await requirePackSchema(context.db, session);
      const catalog = await products.find({ sku: { $in: value.items.map(item => item.sku) } }, { session }).toArray();
      items.push(...calculateOfferItems(catalog, value.items));

      for (const demand of aggregateInventoryItems(items)) {
        const product = catalog.find(product => product.sku === demand.sku)!;
        const available = { $gte: [{ $subtract: ['$inventory.stockQuantity', '$inventory.reservedQuantity'] }, demand.quantity] };

        const result = await products.updateOne({ _id: demand.productId, version: product.version, salesEnabled: true,
          $expr: available }, { $inc: { 'inventory.version': 1, 'inventory.stockQuantity': -demand.quantity },
          $set: { updatedAt: now } }, { session });

        if (!result.modifiedCount) fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');
      }
    } else {
      for (const requested of value.items) {
        const product = await products.findOne({ sku: requested.sku }, { session });

        if (!product || !product.salesEnabled) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');

        if (product.version !== requested.productVersion) fail(409, 'PRICE_CHANGED', 'Review the updated price before checkout.');

        const result = await products.updateOne({
          _id: product._id, version: requested.productVersion, salesEnabled: true,
          $expr: { $gte: [{ $subtract: ['$inventory.stockQuantity', '$inventory.reservedQuantity'] }, requested.quantity] },
        }, { $inc: { 'inventory.version': 1, 'inventory.stockQuantity': -requested.quantity },
          $set: { updatedAt: now } }, { session });

        if (!result.modifiedCount) fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');

        const lineSubtotal = requested.quantity * product.price.unitAmount;

        if (!Number.isSafeInteger(lineSubtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');

        items.push({ productId: product._id, sku: product.sku, name: product.name, quantity: requested.quantity,
          unitAmount: product.price.unitAmount, lineSubtotal, productVersion: product.version });
      }

    }

    const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);

    if (!Number.isSafeInteger(subtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');

    // Zero delivery/tax are test-only policies, not commercial shipping or tax terms.
    const pricing: Order['pricing'] = { state: 'final', subtotal, discount: 0, shipping: 0, tax: 0, total: subtotal };

    const pricingPolicy: Order['pricingPolicy'] = { shipping: 'mock-zero-v1', tax: 'mock-zero-v1', discount: 'none-v1',
      ...(value.cartFormat !== undefined ? { catalog: 'packs-v1' } : {}) };

    const order: Order = {
      _id: orderId, schemaVersion: 1, version: 1, checkoutMode: 'mock',
      orderNumber: `LV-${randomToken().slice(0, 12).toUpperCase()}`,
      creationKeyHash, creationRequestHash: requestHash,
      guestAccess: { tokenHash: hashToken(value.guestToken), expiresAt: new Date(now.getTime() + 30 * 86400000) },
      items, currency: 'USD', pricing, pricingPolicy, orderStatus: 'open',
      ...(salesTerms ? { salesTerms } : {}),
      customer: { name: 'Test Customer', email: 'checkout@example.test' },
      shippingAddress, shippingPolicy: 'contiguous-us-v1',
      payment: { status: 'paid', settledAttemptId: attemptId, amountPaid: subtotal, amountRefunded: 0,
        paidAt: now, disputed: false, reconciliationRequired: false },
      fulfillment: { status: 'unfulfilled' }, restockedQuantities: {}, notifications: [], createdAt: now, updatedAt: now,
    };

    await orders.insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
    await enqueueOrderNotification(context.db, session, order, 'admin.order-paid');
    await attempts.insertOne({
      _id: attemptId, schemaVersion: 1, orderId, requestKeyHash: creationKeyHash, requestHash,
      stripeIdempotencyKey: `mock-only-${attemptId.toHexString()}`, state: 'succeeded', active: false,
      quoteSnapshot: { items, currency: 'USD', pricing, pricingPolicy },
      inventoryReservation: { state: 'committed',
        items: aggregateInventoryItems(items).map(({ productId, quantity }) => ({ productId, quantity })),
        expiresAt: now, committedAt: now },
      shippingSnapshot: shippingAddress,
      livemode: false, createdAt: now, updatedAt: now,
    }, { session });
    await appendAudit(context.db, session, {
      operationId: `mock-checkout-${attemptId.toHexString()}`, requestHash, actor: { type: 'system' },
      entityType: 'order', entityId: orderId, action: 'order.mock-paid',
      changes: { checkoutMode: 'mock', subtotal, items: items.map(item => ({ sku: item.sku, quantity: item.quantity })) },
    });
    return { id: orderId.toHexString(), replayed: false };
  });
};
