import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

import { collections } from '../src/_app/commerce/collections.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { cancelOrder, refundOrder } from '../src/_app/commerce/refunds.server';
import { refundDetailDto } from '../src/_app/commerce/refund-dto.server';
import { updateFulfillment } from '../src/_app/commerce/orders.server';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';
import { ApiError } from '../src/shared/lib/api/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const adminId = new ObjectId();
const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('refund_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => { await context?.client.close(); await replica?.stop(); });

const fixture = async (status: 'unfulfilled' | 'shipped' = 'unfulfilled', mock = false) => {
  const sku = `REFUND-${randomUUID().slice(0, 8).toUpperCase()}`;
  await createProduct(context, adminId, { sku, name: 'Synthetic product', shortDescription: '', unitAmount: 2500,
    stockQuantity: 2, salesEnabled: true, operationId: randomUUID() });

  const reserved = await reserveOrder(context, {
    creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
    guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000), livemode: false,
    pricingPolicy: { shipping: 'test', tax: 'test', discount: 'none-v1' }, items: [{ sku, quantity: 1, productVersion: 1 }],
  });

  const { orders, attempts, products } = collections(context.db);
  const intent = `pi_${reserved.orderId.toHexString()}`;
  const sessionId = `cs_test_${reserved.orderId.toHexString()}`;
  await attempts.updateOne({ _id: reserved.attemptId }, { $set: {
    state: 'succeeded', active: false, stripePaymentIntentId: intent, stripeSessionId: sessionId,
    'inventoryReservation.state': 'committed',
  } });
  await orders.updateOne({ _id: reserved.orderId }, {
    $set: { checkoutMode: mock ? 'mock' : 'stripe', 'payment.status': 'paid', 'payment.amountPaid': 2500,
      'payment.settledAttemptId': reserved.attemptId, 'fulfillment.status': status },
    $unset: { 'payment.activeAttemptId': '' },
  });
  await products.updateOne({ sku }, { $inc: { 'inventory.stockQuantity': -1, 'inventory.reservedQuantity': -1 } });
  const stripe = new Stripe('sk_test_synthetic');
  const providerRefunds: Stripe.Refund[] = [];
  let creates = 0;
  let nextStatus: Stripe.Refund['status'] = 'succeeded';
  stripe.refunds.list = (() => ({ autoPagingToArray: async () => providerRefunds })) as unknown as typeof stripe.refunds.list;
  stripe.refunds.retrieve = (async (id: string) =>
    providerRefunds.find(refund => refund.id === id)) as typeof stripe.refunds.retrieve;
  stripe.refunds.create = (async (params: Stripe.RefundCreateParams) => {
    creates += 1;

    const value = { id: `re_${randomUUID()}`, object: 'refund', payment_intent: intent, amount: params.amount,
      currency: 'usd', created: Math.floor(Date.now() / 1000), status: nextStatus, metadata: params.metadata ?? {},
      reason: null } as Stripe.Refund;

    providerRefunds.push(value);
    return value;
  }) as typeof stripe.refunds.create;

  const event = (refund: Stripe.Refund, type = 'refund.created', id = `evt_${randomUUID()}`) => ({
    id, type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: refund.id } },
  }) as Stripe.Event;

  const addExternal = (amount: number, refundStatus: Stripe.Refund['status'] = 'succeeded') => {
    const value = { id: `re_${randomUUID()}`, object: 'refund', payment_intent: intent, amount, currency: 'usd',
      created: Math.floor(Date.now() / 1000), status: refundStatus, metadata: {},
      reason: 'requested_by_customer' } as Stripe.Refund;

    providerRefunds.push(value);
    return value;
  };

  return { ...reserved, sku, stripe, intent, sessionId, providerRefunds, event, addExternal,
    creates: () => creates, setStatus: (value: Stripe.Refund['status']) => { nextStatus = value; } };
};

const input = () => ({ version: 1, operationId: randomUUID(), reason: 'Synthetic free text' });

test('cancel issues one full refund, restores stock once, and replays across administrators', async () => {
  const f = await fixture();
  const request = input();
  await Promise.all([cancelOrder(context, adminId, f.orderId, request, f.stripe), cancelOrder(context, adminId, f.orderId,
    request, f.stripe)]);
  // Provider idempotency guarantees one request key; synthetic stub can observe duplicate invocations.
  const order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.restockedQuantities[f.sku], 1);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  assert.equal((await cancelOrder(context, new ObjectId(), f.orderId, { ...request, version: order!.version },
    f.stripe)).replayed, true);
  assert.equal(await collections(context.db).transactions.countDocuments({ orderId: f.orderId }), 0);
  const refund = f.providerRefunds[0]!;
  const event = f.event(refund);
  await Promise.all([processStripeEvent(context, event, f.stripe), processStripeEvent(context, event, f.stripe)]);
  assert.equal(await collections(context.db).transactions.countDocuments({ orderId: f.orderId }), 1);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
  await assert.rejects(cancelOrder(context, adminId, f.orderId, { ...request, reason: 'Different' }, f.stripe),
    hasCode('IDEMPOTENCY_CONFLICT'));
});

test('pending cancellation blocks shipment and late success completes inventory atomically', async () => {
  const f = await fixture();
  f.setStatus('pending');
  await cancelOrder(context, adminId, f.orderId, input(), f.stripe);
  let order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.cancellationRequest?.status, 'pending');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
  await assert.rejects(updateFulfillment(context, adminId, f.orderId, { version: order!.version,
    operationId: randomUUID(), status: 'processing' }), hasCode('FULFILLMENT_BLOCKED'));
  f.providerRefunds[0]!.status = 'succeeded';
  await processStripeEvent(context, f.event(f.providerRefunds[0]!, 'refund.updated'), f.stripe);
  order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
});

test('external partial/full refunds only update finance; shipped refund preserves stock and shipment', async () => {
  const f = await fixture('shipped');
  const external = f.addExternal(500);
  const event = f.event(external);
  await processStripeEvent(context, event, f.stripe);
  let order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.status, 'partially_refunded');
  assert.equal(order?.orderStatus, 'open');
  assert.equal(order?.cancellationRequest, undefined);
  await refundOrder(context, adminId, f.orderId, { ...input(), version: order!.version }, f.stripe);
  order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(f.providerRefunds[1]?.amount, 2000);
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.fulfillment.status, 'shipped');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
  const dto = await refundDetailDto(context.db, order!);
  assert.equal(dto.canRefund, false);
  assert.equal(dto.refunds.find(refund => refund.source === 'stripe')?.providerReason, 'requested_by_customer');
});

test('failed cancellation remains blocked and a fresh operation retries without double inventory', async () => {
  const f = await fixture();
  f.setStatus('failed');
  const first = input();
  await cancelOrder(context, adminId, f.orderId, first, f.stripe);
  let order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.cancellationRequest?.status, 'pending');
  assert.equal((await refundDetailDto(context.db, order!)).canCancel, true);
  f.setStatus('succeeded');
  await cancelOrder(context, adminId, f.orderId, { ...input(), version: order!.version }, f.stripe);
  order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
});

test('mock cancellation refunds locally without financial Stripe observations', async () => {
  const f = await fixture('unfulfilled', true);
  await cancelOrder(context, adminId, f.orderId, input());
  assert.equal(f.creates(), 0);
  assert.equal(await collections(context.db).transactions.countDocuments({ orderId: f.orderId }), 0);
  assert.equal((await collections(context.db).orders.findOne({ _id: f.orderId }))?.payment.status, 'refunded');
});

test('succeeded refund later failing corrects finance and holds already restocked cancellation', async () => {
  const f = await fixture();
  await cancelOrder(context, adminId, f.orderId, input(), f.stripe);
  const refund = f.providerRefunds[0]!;
  refund.metadata = {}; // Once bound, editable Stripe metadata cannot break later synchronization.
  refund.status = 'failed';
  await processStripeEvent(context, f.event(refund, 'refund.failed'), f.stripe);
  const order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.amountRefunded, 0);
  assert.equal(order?.payment.status, 'paid');
  assert.equal(order?.payment.reconciliationRequired, true);
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 2);
});

test('legacy paid cancelled orders permit money-only refund without changing existing stock', async () => {
  const f = await fixture();
  await collections(context.db).orders.updateOne({ _id: f.orderId }, {
    $set: { orderStatus: 'cancelled', 'fulfillment.status': 'cancelled' },
  });
  let order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal((await refundDetailDto(context.db, order!)).canRefund, true);
  await refundOrder(context, adminId, f.orderId, input(), f.stripe);
  order = await collections(context.db).orders.findOne({ _id: f.orderId });
  assert.equal(order?.payment.amountRefunded, 2500);
  assert.equal(order?.fulfillment.status, 'cancelled');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.stockQuantity, 1);
});
