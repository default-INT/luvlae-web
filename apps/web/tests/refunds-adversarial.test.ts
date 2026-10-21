import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Stripe from 'stripe';

import { collections } from '../src/_app/commerce/collections.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { cancelOrder, refundOrder } from '../src/_app/commerce/refunds.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const adminId = new ObjectId();
const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;
const input = () => ({ version: 1, operationId: randomUUID(), reason: 'Synthetic cancellation reason' });

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('refund_adversarial_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();
});

const eventFor = (id: string, type = 'refund.created', eventId = `evt_${randomUUID()}`) => ({
  id: eventId, type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id } },
}) as Stripe.Event;

const fixture = async (paid = true, shipped = false) => {
  const sku = `ADVERSARIAL-${randomUUID().slice(0, 8).toUpperCase()}`;

  await createProduct(context, adminId, {
    sku, name: 'Synthetic product', shortDescription: '', unitAmount: 2500,
    stockQuantity: 2, salesEnabled: true, operationId: randomUUID(),
  });

  const reserved = await reserveOrder(context, {
    creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
    guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000),
    livemode: false, checkoutMode: 'stripe',
    pricingPolicy: { shipping: 'included-us-v1', tax: 'included-v1', discount: 'none-v1' },
    items: [{ sku, quantity: 1, productVersion: 1 }],
  });

  assert.ok(reserved.attemptId);
  const { orders, attempts, products } = collections(context.db);
  const intent = `pi_${reserved.orderId.toHexString()}`;
  const sessionId = `cs_test_${reserved.orderId.toHexString()}`;

  await attempts.updateOne({ _id: reserved.attemptId }, { $set: {
    stripeSessionId: sessionId, state: paid ? 'succeeded' : 'open', active: !paid,
    ...(paid ? { stripePaymentIntentId: intent, 'inventoryReservation.state': 'committed' } : {}),
  } });

  if (paid) {
    await orders.updateOne({ _id: reserved.orderId }, {
      $set: {
        'payment.status': 'paid', 'payment.amountPaid': 2500, 'payment.settledAttemptId': reserved.attemptId,
        'fulfillment.status': shipped ? 'shipped' : 'unfulfilled',
      },
      $unset: { 'payment.activeAttemptId': '' },
    });
    await products.updateOne({ sku }, { $inc: { 'inventory.stockQuantity': -1, 'inventory.reservedQuantity': -1 } });
  }

  const checkout = {
    id: sessionId, livemode: false, mode: 'payment', currency: 'usd',
    status: paid ? 'complete' : 'open', payment_status: paid ? 'paid' : 'unpaid',
    metadata: { orderId: reserved.orderId.toHexString(), attemptId: reserved.attemptId.toHexString() },
    client_reference_id: reserved.orderId.toHexString(), amount_subtotal: 2500, amount_total: 2500,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
    customer_details: { email: 'synthetic@example.invalid', name: 'Synthetic customer' },
    collected_information: { shipping_details: {
      name: 'Synthetic customer', address: {
        line1: '1 Synthetic Street', city: 'Synthetic', state: 'CA', postal_code: '90001', country: 'US',
      },
    } },
    payment_intent: paid ? {
      id: intent, livemode: false, currency: 'usd', status: 'succeeded', amount: 2500, amount_received: 2500,
    } : null,
  } as unknown as Stripe.Checkout.Session;

  const stripe = new Stripe('sk_test_synthetic');
  const providerRefunds: Stripe.Refund[] = [];
  const requestKeys: (string | undefined)[] = [];
  const refundRequests: Stripe.RefundCreateParams[] = [];
  const refundsByKey = new Map<string, { refund: Stripe.Refund; params: Stripe.RefundCreateParams }>();

  // These transport stubs intentionally omit SDK-only response headers.
  stripe.checkout.sessions.retrieve = (async () => checkout) as unknown as typeof stripe.checkout.sessions.retrieve;
  stripe.checkout.sessions.expire = (async () => {
    checkout.status = 'expired';
    return checkout;
  }) as unknown as typeof stripe.checkout.sessions.expire;
  stripe.refunds.list = (() => ({
    autoPagingToArray: async () => [...providerRefunds],
  })) as unknown as typeof stripe.refunds.list;

  stripe.refunds.retrieve = (async (id: string) => {
    const refund = providerRefunds.find(value => value.id === id);
    assert.ok(refund);
    return { ...refund };
  }) as typeof stripe.refunds.retrieve;

  const addRefund = (amount: number, metadata: Stripe.Metadata = {}, status: Stripe.Refund['status'] = 'succeeded') => {
    const refund = {
      id: `re_${randomUUID()}`, object: 'refund', payment_intent: intent, amount, metadata, status,
      currency: 'usd', created: Math.floor(Date.now() / 1000), reason: null,
    } as Stripe.Refund;

    providerRefunds.push(refund);
    return refund;
  };

  stripe.refunds.create = (async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
    requestKeys.push(options?.idempotencyKey);
    refundRequests.push(structuredClone(params));
    assert.ok(options?.idempotencyKey);
    const existing = refundsByKey.get(options.idempotencyKey);

    if (existing) {
      assert.deepEqual(params, existing.params, 'Stripe rejects reused keys with different parameters');
      return { ...existing.refund };
    }

    assert.ok(params.amount);
    const refund = addRefund(params.amount, params.metadata as Stripe.Metadata);
    refundsByKey.set(options.idempotencyKey, { refund, params: structuredClone(params) });
    return { ...refund };
  }) as typeof stripe.refunds.create;

  return { ...reserved, sku, intent, sessionId, checkout, stripe, providerRefunds, requestKeys, refundRequests, addRefund };
};

test('unpaid cancellation expires Checkout before releasing reservation and never refunds or increases stock', async () => {
  const f = await fixture(false);
  const request = input();
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  const { orders, products, attempts, transactions } = collections(context.db);
  const order = await orders.findOne({ _id: f.orderId });
  const product = await products.findOne({ sku: f.sku });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal(order?.payment.amountPaid, 0);
  assert.equal(order?.payment.amountRefunded, 0);
  assert.equal(order?.payment.activeAttemptId, undefined);
  assert.equal(product?.inventory.stockQuantity, 2);
  assert.equal(product?.inventory.reservedQuantity, 0);
  assert.equal((await attempts.findOne({ _id: f.attemptId }))?.inventoryReservation.state, 'released');
  assert.equal(f.providerRefunds.length, 0);
  assert.equal(await transactions.countDocuments({ orderId: f.orderId }), 0);
});

test('payment winning Checkout expiration holds inventory, then same cancellation resumes after settlement', async () => {
  const f = await fixture(false);
  const request = input();

  f.stripe.checkout.sessions.expire = (async () => {
    f.checkout.status = 'complete';
    f.checkout.payment_status = 'paid';
    f.checkout.payment_intent = {
      id: f.intent, livemode: false, currency: 'usd', status: 'succeeded', amount: 2500, amount_received: 2500,
    } as Stripe.PaymentIntent;
    throw new Error('Checkout completed while expiring');
  }) as typeof f.stripe.checkout.sessions.expire;

  await assert.rejects(cancelOrder(context, adminId, f.orderId, request, f.stripe), hasCode('PAYMENT_RECONCILIATION_REQUIRED'));
  const { orders, products, refunds } = collections(context.db);
  const held = await orders.findOne({ _id: f.orderId });
  assert.equal(held?.cancellationRequest?.status, 'pending');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal((await refunds.findOne({ operationId: request.operationId }))?.status, 'unknown');
  await processStripeEvent(context, eventFor(f.sessionId, 'checkout.session.completed'), f.stripe);
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  const completed = await orders.findOne({ _id: f.orderId });
  assert.equal(completed?.orderStatus, 'cancelled');
  assert.equal(completed?.payment.amountRefunded, 2500);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 0);
  assert.equal(f.providerRefunds.length, 1);
});

test('lost response after Stripe creates refund recovers by metadata without another create call', async () => {
  const f = await fixture();
  const request = input();
  const originalCreate = f.stripe.refunds.create.bind(f.stripe.refunds);

  f.stripe.refunds.create = (async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
    await originalCreate(params, options);
    throw new Error('Synthetic connection reset after commit');
  }) as typeof f.stripe.refunds.create;

  await assert.rejects(cancelOrder(context, adminId, f.orderId, request, f.stripe), /connection reset/);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
  const recovered = await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  assert.equal(recovered.status, 'succeeded');
  assert.equal(recovered.replayed, true);
  assert.equal(f.requestKeys.length, 1);
  assert.equal(f.providerRefunds.length, 1);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
});

test('timeout before Stripe receives request retries the original immutable idempotency key', async () => {
  const f = await fixture(true, true);
  const request = input();
  const originalCreate = f.stripe.refunds.create.bind(f.stripe.refunds);
  let lostKey: string | undefined;

  f.stripe.refunds.create = (async (_params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
    lostKey = options?.idempotencyKey;
    throw new Error('Synthetic connection reset before commit');
  }) as typeof f.stripe.refunds.create;

  await assert.rejects(refundOrder(context, adminId, f.orderId, request, f.stripe), /connection reset/);
  f.stripe.refunds.create = originalCreate;
  await refundOrder(context, adminId, f.orderId, request, f.stripe);
  assert.equal(f.requestKeys[0], lostKey);
  assert.equal(lostKey, `luvlae-refund:${request.operationId}`);
  assert.equal(f.providerRefunds.length, 1);
  assert.equal((await collections(context.db).orders.findOne({ _id: f.orderId }))?.payment.status, 'refunded');
});

test('Stripe idempotency cache prevents duplicate refunds when a lost response is absent from the list', async () => {
  const f = await fixture(true, true);
  const request = input();
  const originalCreate = f.stripe.refunds.create.bind(f.stripe.refunds);

  f.stripe.refunds.list = (() => ({ autoPagingToArray: async () => [] })) as unknown as typeof f.stripe.refunds.list;
  f.stripe.refunds.create = (async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
    await originalCreate(params, options);
    throw new Error('Synthetic response lost after commit');
  }) as typeof f.stripe.refunds.create;

  await assert.rejects(refundOrder(context, adminId, f.orderId, request, f.stripe), /response lost/);
  f.stripe.refunds.create = originalCreate;
  await refundOrder(context, adminId, f.orderId, request, f.stripe);
  assert.deepEqual(f.requestKeys, [
    `luvlae-refund:${request.operationId}`, `luvlae-refund:${request.operationId}`,
  ]);
  assert.deepEqual(f.refundRequests[0], {
    payment_intent: f.intent, amount: 2500,
    metadata: { orderId: f.orderId.toHexString(), operationId: request.operationId },
  });
  assert.deepEqual(f.refundRequests[1], f.refundRequests[0]);
  assert.equal(f.providerRefunds.length, 1);
  assert.equal((await collections(context.db).orders.findOne({ _id: f.orderId }))?.payment.amountRefunded, 2500);
});

test('refund webhook arriving before API response completes cancellation and restocks only once', async () => {
  const f = await fixture();
  const request = input();
  const originalCreate = f.stripe.refunds.create.bind(f.stripe.refunds);
  let earlyEvent: Stripe.Event | undefined;

  f.stripe.refunds.create = (async (params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) => {
    const refund = await originalCreate(params, options);
    earlyEvent = eventFor(refund.id);
    await processStripeEvent(context, earlyEvent, f.stripe);
    return refund;
  }) as typeof f.stripe.refunds.create;

  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  assert.ok(earlyEvent);
  assert.equal((await processStripeEvent(context, earlyEvent, f.stripe)).replayed, true);
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  const { orders, products, transactions, refunds } = collections(context.db);
  assert.equal((await orders.findOne({ _id: f.orderId }))?.orderStatus, 'cancelled');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal(await transactions.countDocuments({ orderId: f.orderId }), 1);
  assert.equal(await refunds.countDocuments({ orderId: f.orderId }), 1);
  assert.equal(f.providerRefunds.length, 1);
});

test('processed refund event stays immutable when replay retrieves a newer provider state', async () => {
  const f = await fixture(true, true);
  const refund = f.addRefund(500, {}, 'pending');
  const pendingEvent = eventFor(refund.id);
  await processStripeEvent(context, pendingEvent, f.stripe);
  refund.status = 'succeeded';
  assert.equal((await processStripeEvent(context, pendingEvent, f.stripe)).replayed, true);
  await processStripeEvent(context, eventFor(refund.id, 'refund.updated'), f.stripe);
  assert.equal((await processStripeEvent(context, pendingEvent, f.stripe)).replayed, true);
  const { orders, transactions } = collections(context.db);
  assert.equal((await orders.findOne({ _id: f.orderId }))?.payment.amountRefunded, 500);
  assert.equal(await transactions.countDocuments({ orderId: f.orderId }), 2);
  assert.equal(await transactions.countDocuments({ providerEventId: pendingEvent.id, status: 'pending' }), 1);
  assert.equal(await transactions.countDocuments({ providerEventId: pendingEvent.id, status: 'succeeded' }), 0);
});

test('late Checkout completion after refund cannot overwrite refunded finance or recommit stock', async () => {
  const f = await fixture();
  await cancelOrder(context, adminId, f.orderId, input(), f.stripe);
  await processStripeEvent(context, eventFor(f.sessionId, 'checkout.session.completed'), f.stripe);
  await processStripeEvent(context, eventFor(f.sessionId, 'checkout.session.expired'), f.stripe);
  const { orders, products, attempts } = collections(context.db);
  const order = await orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.status, 'refunded');
  assert.equal(order?.payment.amountPaid, 2500);
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 0);
  assert.equal((await attempts.findOne({ _id: f.attemptId }))?.inventoryReservation.state, 'committed');
});

test('Dashboard partial refund racing local intent is reconciled in the same cancellation action', async () => {
  const f = await fixture();
  const request = input();
  const originalList = f.stripe.refunds.list.bind(f.stripe.refunds);
  let inserted = false;

  f.stripe.refunds.list = ((...args: Parameters<typeof f.stripe.refunds.list>) => {
    if (!inserted) {
      inserted = true;
      f.addRefund(500);
    }

    return originalList(...args);
  }) as typeof f.stripe.refunds.list;

  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  const { orders, products, refunds } = collections(context.db);
  const order = await orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.payment.status, 'refunded');
  assert.equal(order?.cancellationRequest?.status, 'succeeded');
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal(f.requestKeys.length, 1);
  assert.equal(f.providerRefunds.length, 2);
  const original = await refunds.findOne({ operationId: request.operationId });
  assert.equal(original?.active, false);
  assert.equal(original?.status, 'succeeded');
  assert.equal(original?.amount, 2000);
  assert.ok(original?.providerRequestStartedAt);
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  assert.deepEqual(f.refundRequests.map(value => value.amount), [2000]);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
});

test('Refund imports a missed full Stripe refund without issuing another refund or changing stock', async () => {
  const f = await fixture(true, true);
  const external = f.addRefund(2500);
  const request = input();
  const { orders, refunds, products, transactions } = collections(context.db);
  assert.equal((await orders.findOne({ _id: f.orderId }))?.payment.amountRefunded, 0);
  await refundOrder(context, adminId, f.orderId, request, f.stripe);
  await refundOrder(context, adminId, f.orderId, request, f.stripe);
  const order = await orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.payment.status, 'refunded');
  assert.equal(order?.fulfillment.status, 'shipped');
  assert.equal(order?.orderStatus, 'open');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
  assert.equal(f.requestKeys.length, 0);
  assert.equal(await refunds.countDocuments({ providerRefundId: external.id, source: 'stripe' }), 1);
  assert.equal((await refunds.findOne({ operationId: request.operationId }))?.amount, 0);
  assert.equal(await transactions.countDocuments({ orderId: f.orderId }), 0);
});

test('Cancel imports a missed full Stripe refund and completes inventory restoration exactly once', async () => {
  const f = await fixture();
  const external = f.addRefund(2500);
  const request = input();
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  await cancelOrder(context, adminId, f.orderId, request, f.stripe);
  const { orders, products, refunds } = collections(context.db);
  const order = await orders.findOne({ _id: f.orderId });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal(order?.cancellationRequest?.status, 'succeeded');
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.restockedQuantities[f.sku], 1);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal(f.requestKeys.length, 0);
  await processStripeEvent(context, eventFor(external.id), f.stripe);
  assert.equal((await orders.findOne({ _id: f.orderId }))?.payment.amountRefunded, 2500);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal(await refunds.countDocuments({ providerRefundId: external.id }), 1);
});

test('Refund imports missed partial Stripe history and refunds only the remaining amount', async () => {
  const f = await fixture(true, true);
  f.addRefund(500);
  await refundOrder(context, adminId, f.orderId, input(), f.stripe);
  assert.deepEqual(f.refundRequests.map(value => value.amount), [2000]);
  const { orders, products } = collections(context.db);
  assert.equal((await orders.findOne({ _id: f.orderId }))?.payment.amountRefunded, 2500);
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
});

test('missed pending Stripe refund is synchronized without assuming success or returning inventory', async () => {
  const f = await fixture();
  const external = f.addRefund(2500, {}, 'pending');
  await assert.rejects(cancelOrder(context, adminId, f.orderId, input(), f.stripe),
    hasCode('REFUND_RECONCILIATION_REQUIRED'));
  const { orders, products, refunds } = collections(context.db);
  const order = await orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.amountRefunded, 0);
  assert.equal(order?.cancellationRequest?.status, 'pending');
  assert.equal((await refunds.findOne({ providerRefundId: external.id }))?.status, 'pending');
  assert.equal((await products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
  assert.equal(f.requestKeys.length, 0);
});
