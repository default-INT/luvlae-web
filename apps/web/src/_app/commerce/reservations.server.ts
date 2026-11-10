import 'server-only';

import { MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { randomToken } from '@/shared/lib/security/index.server';

import { appendAudit, requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { legacyCheckoutItemsSchema, packCheckoutItemsSchema } from './contracts';
import { calculateOfferItems } from './offer-calculator.server';
import { readActiveSalesTerms } from './sales-terms.server';
import { shippingAddressSchema } from './shipping-address';
import { requireShippingSchema } from './shipping-migration.server';
import { aggregateInventoryItems, requirePackSchema } from './inventory-items.server';

import type { CheckoutAttempt, Order } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

const hash = z.string().regex(/^[a-f0-9]{64}$/);

const reservationFields = {
  creationKeyHash: hash, guestTokenHash: hash, guestAccessExpiresAt: z.date(),
  expiresAt: z.date(), livemode: z.boolean(), checkoutMode: z.literal('stripe').optional(),
  pricingPolicy: z.strictObject({ shipping: z.string().min(1), tax: z.string().min(1), discount: z.literal('none-v1'),
    catalog: z.literal('packs-v1').optional() }),
};

const reservationSchema = z.union([
  z.strictObject({ ...reservationFields, cartFormat: z.undefined().optional(), items: legacyCheckoutItemsSchema }),
  z.strictObject({ ...reservationFields, cartFormat: z.literal('packs-v1'), items: packCheckoutItemsSchema }),
  z.strictObject({ ...reservationFields, cartFormat: z.literal('packs-v2'), items: packCheckoutItemsSchema,
    shippingAddress: shippingAddressSchema }),
]);

// A server use case, not an HTTP route. Provider setup/reconciliation is deliberately a separate integration.
// The caller supplies approved policies/expiry and guest-scoped key hashes; no default sales terms are invented.
interface ReservationOptions {
  prepareAttempt?: (attempt: CheckoutAttempt) => CheckoutAttempt['customerProvision'];
  createStripeRequest?: (attempt: CheckoutAttempt) => NonNullable<CheckoutAttempt['stripeRequest']>;
}

export const reserveOrder = async (
  context: DatabaseContext, input: z.infer<typeof reservationSchema>, options?: ReservationOptions,
) => {
  const value = reservationSchema.parse(input);

  if (value.cartFormat !== undefined) value.pricingPolicy.catalog = 'packs-v1';
  else if (value.pricingPolicy.catalog) fail(400, 'INVALID_INPUT', 'Catalog policy requires packs format.');

  const requestHash = requestFingerprint({
    ...(value.cartFormat !== undefined ? { cartFormat: value.cartFormat } : {}),
    ...(value.cartFormat === 'packs-v2' ? { shippingAddress: value.shippingAddress } : {}),
    items: value.items, pricingPolicy: value.pricingPolicy, livemode: value.livemode,
    guestTokenHash: value.guestTokenHash, ...(value.checkoutMode ? { checkoutMode: value.checkoutMode } : {}),
  });

  const reserve = () => inTransaction(context, async session => {
    const { products, orders, attempts } = collections(context.db);
    const existing = await orders.findOne({ creationKeyHash: value.creationKeyHash }, { session });

    if (existing) {
      if (existing.creationRequestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'Request contents changed.');

      const attempt = await attempts.findOne({ requestKeyHash: value.creationKeyHash }, { session });
      return { orderId: existing._id, attemptId: attempt?._id, replayed: true };
    }

    if (options?.prepareAttempt && value.cartFormat !== 'packs-v2') {
      fail(409, 'CHECKOUT_RELOAD_REQUIRED', 'Reload your cart to provide a delivery address.');
    }

    if (value.cartFormat === 'packs-v2') await requireShippingSchema(context.db, session);

    if (value.expiresAt.getTime() <= Date.now() || value.guestAccessExpiresAt.getTime() <= Date.now()) {
      fail(400, 'INVALID_EXPIRATION', 'Reservation and access expiration must be in the future.');
    }

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

        const reserved = await products.updateOne({ _id: demand.productId, version: product.version, salesEnabled: true,
          $expr: available }, { $inc: { 'inventory.version': 1, 'inventory.reservedQuantity': demand.quantity },
          $set: { updatedAt: now } }, { session });

        if (!reserved.modifiedCount) fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');
      }
    } else {
    // Sequential DB calls: MongoDB does not support parallel operations within a transaction.
      for (const requested of value.items) {
        const product = await products.findOne({ sku: requested.sku }, { session });

        if (!product || !product.salesEnabled) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');

        if (product.version !== requested.productVersion) fail(409, 'PRICE_CHANGED', 'Confirm the updated product offer.');

        const reserved = await products.updateOne({
          _id: product._id, version: requested.productVersion, salesEnabled: true,
          $expr: { $gte: [{ $subtract: ['$inventory.stockQuantity', '$inventory.reservedQuantity'] }, requested.quantity] },
        }, { $inc: { 'inventory.version': 1, 'inventory.reservedQuantity': requested.quantity },
          $set: { updatedAt: now } }, { session });

        if (!reserved.modifiedCount) fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');

        const lineSubtotal = product.price.unitAmount * requested.quantity;

        if (!Number.isSafeInteger(lineSubtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');

        items.push({
          productId: product._id, sku: product.sku, name: product.name, quantity: requested.quantity,
          unitAmount: product.price.unitAmount, lineSubtotal, productVersion: product.version,
        });
      }

    }

    const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);

    if (!Number.isSafeInteger(subtotal)) fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');

    if (value.checkoutMode === 'stripe' && (subtotal < 50 || subtotal > 99999999)) {
      fail(409, 'INVALID_CHECKOUT_AMOUNT', 'The checkout total must be between USD 0.50 and USD 999,999.99.');
    }

    const pricing: Order['pricing'] = value.checkoutMode === 'stripe'
      ? { state: 'final', subtotal, discount: 0, shipping: 0, tax: 0, total: subtotal }
      : { state: 'estimated', subtotal, discount: 0, shipping: null, tax: null, total: null };

    const order: Order = {
      _id: orderId, schemaVersion: 1, version: 1, ...(value.checkoutMode ? { checkoutMode: value.checkoutMode } : {}),
      orderNumber: `LV-${randomToken().slice(0, 16).toUpperCase()}`,
      creationKeyHash: value.creationKeyHash, creationRequestHash: requestHash,
      guestAccess: { tokenHash: value.guestTokenHash, expiresAt: value.guestAccessExpiresAt },
      ...(value.cartFormat === 'packs-v2' ? { shippingAddress: value.shippingAddress,
        shippingPolicy: 'contiguous-us-v1' as const } : {}),
      items, currency: 'USD', pricing, pricingPolicy: value.pricingPolicy, orderStatus: 'open',
      ...(salesTerms ? { salesTerms } : {}),
      payment: {
        status: 'pending', activeAttemptId: attemptId, amountPaid: 0, amountRefunded: 0,
        disputed: false, reconciliationRequired: false,
      },
      fulfillment: { status: 'unfulfilled' }, restockedQuantities: {}, notifications: [], createdAt: now, updatedAt: now,
    };

    await orders.insertOne(order, { session });

    const attempt: CheckoutAttempt = {
      _id: attemptId, schemaVersion: 1, orderId, requestKeyHash: value.creationKeyHash, requestHash,
      stripeIdempotencyKey: `checkout-${attemptId.toHexString()}`, state: 'creating', active: true,
      quoteSnapshot: { items, currency: 'USD', pricing, pricingPolicy: value.pricingPolicy },
      inventoryReservation: {
        state: 'held', items: aggregateInventoryItems(items).map(({ productId, quantity }) => ({ productId, quantity })),
        expiresAt: value.expiresAt,
      },
      ...(value.cartFormat === 'packs-v2' ? { shippingSnapshot: value.shippingAddress } : {}),
      livemode: value.livemode, createdAt: now, updatedAt: now,
    };

    if (options?.prepareAttempt && value.cartFormat === 'packs-v2') {
      attempt.customerProvision = options.prepareAttempt(attempt);
    }

    if (options?.createStripeRequest) attempt.stripeRequest = options.createStripeRequest(attempt);

    await attempts.insertOne(attempt, { session });
    await appendAudit(context.db, session, {
      operationId: `reserve-${attemptId.toHexString()}`, requestHash, actor: { type: 'system' },
      entityType: 'order', entityId: orderId, action: 'order.reserve',
      changes: { items: items.map(item => ({ sku: item.sku, quantity: item.quantity })) },
    });
    return { orderId, attemptId, replayed: false };
  });

  try {
    return await reserve();
  } catch (error) {
    // A concurrent transaction can win the unique creation key after our snapshot read.
    if (error instanceof MongoServerError && error.code === 11000) return reserve();

    throw error;
  }
};
