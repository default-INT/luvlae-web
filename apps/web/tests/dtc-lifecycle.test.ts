import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

import { renderNotificationEmail } from '../src/_app/emails/index.server';
import { requestFingerprint } from '../src/_app/commerce/audit.server';
import { createOffer, updateOffer } from '../src/_app/commerce/catalog-mutations.server';
import { createCheckoutSession } from '../src/_app/commerce/checkout-session.server';
import { collections } from '../src/_app/commerce/collections.server';
import { quoteSchema } from '../src/_app/commerce/contracts';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createMockOrder as rawCreateMockOrder } from '../src/_app/commerce/mock-checkout.server';
import { orderDetailDto, restockOrder } from '../src/_app/commerce/orders.server';
import { calculateQuote, createProduct } from '../src/_app/commerce/products.server';
import { cancelOrder, refundOrder } from '../src/_app/commerce/refunds.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { findGuestOrder } from '../src/entities/order/api/guest-order.server';
import { getOrderItemsAnalytics } from '../src/entities/order/model/analytics';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import { withShipping, stubShippingCustomers, syntheticShipping } from './helpers/shipping';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

const createMockOrder = (context: DatabaseContext, input: Parameters<typeof rawCreateMockOrder>[1]) =>
  rawCreateMockOrder(context, withShipping(input));

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const admin = new ObjectId();

const envKeys = ['STRIPE_MODE', 'STRIPE_CHEKOUT_DISABLED', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET', 'MOCK_CHECKOUT_ENABLED'] as const;

const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const code = (value: string) => (error: unknown) => error instanceof ApiError && error.code === value;
const mutation = (version: number) => ({ version, operationId: randomUUID(), reason: 'Synthetic lifecycle test' });

before(async () => {
  Object.assign(process.env, { STRIPE_MODE: 'test', STRIPE_CHEKOUT_DISABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_synthetic',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', MOCK_CHECKOUT_ENABLED: 'true' });
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('dtc_lifecycle') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });
after(async () => {
  await context?.client.close(); await replica?.stop();

  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});
const product = async (sku: string) => (await collections(context.db).products.findOne({ sku }))!;

const fixture = async (stockQuantity = 12) => {
  const sku = `PACK-${randomUUID().slice(0, 8).toUpperCase()}`;
  await createProduct(context, admin, { sku, name: 'Synthetic patches', shortDescription: '', unitAmount: 1999,
    stockQuantity, salesEnabled: true, operationId: randomUUID() });

  const two = (await createOffer(context, admin, sku, { ...mutation(1), unitsPerPack: 2,
    unitAmount: 2999, sortOrder: 1 })).offerId!;

  await updateOffer(context, admin, sku, two, { ...mutation(2), status: 'active' });

  const three = (await createOffer(context, admin, sku, { ...mutation(3), unitsPerPack: 3,
    unitAmount: 3999, sortOrder: 2 })).offerId!;

  await updateOffer(context, admin, sku, three, { ...mutation(4), status: 'active' });
  return { sku, two, three, input: { cartFormat: 'packs-v2' as const, shippingAddress: syntheticShipping,
    operationId: randomUUID(), guestToken: randomToken(),
    items: [{ sku, offerId: two, quantity: 2, productVersion: 5 }, { sku, offerId: three, quantity: 1, productVersion: 5 }] } };
};

const provider = () => {
  const stripe = new Stripe('sk_test_synthetic');
  stubShippingCustomers(stripe);
  const requests: Stripe.Checkout.SessionCreateParams[] = [];
  let checkout: Stripe.Checkout.Session;
  let timeout = true;

  stripe.checkout.sessions.create = async (parameters, options) => {
    assert.ok(parameters);
    const attempt = await collections(context.db).attempts.findOne({ stripeIdempotencyKey: options?.idempotencyKey });
    assert.deepEqual(parameters, attempt?.stripeRequest?.parameters);
    requests.push(structuredClone(parameters));

    if (requests.length > 1) assert.deepEqual(requests[0], parameters);

    const total = parameters.line_items!.reduce((sum, line) => sum + line.quantity! * line.price_data!.unit_amount!, 0);
    checkout = { id: `cs_test_synthetic_pack_${randomUUID()}`, object: 'checkout.session',
      mode: 'payment', ui_mode: 'embedded_page',
      customer: parameters.customer, automatic_tax: { enabled: true, status: 'complete' },
      livemode: false, status: 'open', payment_status: 'unpaid', currency: 'usd',
      metadata: parameters.metadata, client_reference_id: parameters.client_reference_id,
      amount_subtotal: total, amount_total: total, expires_at: parameters.expires_at,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 }, payment_intent: null } as Stripe.Checkout.Session;

    if (timeout) { timeout = false; throw new Error('Synthetic lost provider response'); }

    return checkout as Stripe.Response<Stripe.Checkout.Session>;
  };

  stripe.checkout.sessions.retrieve = async () => checkout as Stripe.Response<Stripe.Checkout.Session>;
  return { stripe, requests, checkout: () => checkout };
};

test('pack quote, frozen Stripe retry, payment and duplicate webhook use physical stock and immutable set prices', async () => {
  const f = await fixture();

  const quote = await calculateQuote(context, quoteSchema.parse({
    cartFormat: 'packs-v1', items: f.input.items.map(({ productVersion: _version, ...item }) => item),
  }));

  assert.equal(quote.pricing.subtotal, 9997);
  const p = provider();
  await assert.rejects(createCheckoutSession(context, f.input, p.stripe), code('STRIPE_CHECKOUT_UNAVAILABLE'));
  const reserved = await collections(context.db).orders.findOne({ 'items.sku': f.sku });
  assert.ok(reserved);
  assert.equal((await product(f.sku)).inventory.reservedQuantity, 7);
  const attempt = await collections(context.db).attempts.findOne({ orderId: reserved._id });
  assert.deepEqual(attempt?.inventoryReservation.items.map(item => item.quantity), [7]);
  assert.equal(attempt?.quoteSnapshot.pricingPolicy.catalog, 'packs-v1');
  assert.deepEqual(reserved.items.map(item => [item.quantity, item.unitsPerPack, item.inventoryQuantity]),
    [[2, 2, 4], [1, 3, 3]]);
  assert.match(reserved.items[0].name, /2-Pack/);
  await updateOffer(context, admin, f.sku, f.two, { ...mutation(5), status: 'archived' });
  const retry = await createCheckoutSession(context, f.input, p.stripe);
  assert.equal(retry.replayed, true);
  assert.equal((await product(f.sku)).inventory.reservedQuantity, 7);
  assert.deepEqual(p.requests[1].line_items?.map(line => [line.quantity, line.price_data?.unit_amount]), [[2, 2999], [1, 3999]]);
  const checkout = p.checkout();
  Object.assign(checkout, { status: 'complete', payment_status: 'paid', payment_intent: {
    id: 'pi_synthetic_pack', livemode: false, status: 'succeeded', currency: 'usd', amount: 9997, amount_received: 9997,
  }, customer_details: { email: 'synthetic@example.test', name: 'Synthetic Buyer' },
  collected_information: { shipping_details: { name: 'Synthetic Buyer', address: {
    line1: 'Synthetic street', city: 'Test City', state: 'CA', postal_code: '90001', country: 'US',
  } } } });

  const event = { id: `evt_${randomUUID()}`, type: 'checkout.session.completed', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.id } } } as Stripe.Event;

  await processStripeEvent(context, event, p.stripe);
  await processStripeEvent(context, event, p.stripe);
  assert.equal((await product(f.sku)).inventory.stockQuantity, 5);
  assert.equal((await product(f.sku)).inventory.reservedQuantity, 0);
  const guest = await findGuestOrder(context.db, retry.id, f.input.guestToken);
  assert.equal(guest?.items[0].inventoryQuantity, 4);
  assert.equal(getOrderItemsAnalytics(guest!.items, 'USD', 9997).items[0].item_variant, f.two);
  assert.equal(orderDetailDto(reserved).items[1].unitsPerPack, 3);
});

test('mock cancellation restores mixed SKU packs once after cumulative physical restock', async () => {
  const f = await fixture();
  const paid = await createMockOrder(context, f.input);
  assert.equal((await product(f.sku)).inventory.stockQuantity, 5);
  const id = new ObjectId(paid.id);
  await collections(context.db).orders.updateOne({ _id: id }, { $set: { [`restockedQuantities.${f.sku}`]: 1 } });
  await collections(context.db).products.updateOne({ sku: f.sku }, { $inc: { 'inventory.stockQuantity': 1 } });
  const cancel = mutation(1);
  await cancelOrder(context, admin, id, cancel);
  await cancelOrder(context, admin, id, cancel);
  const order = await collections(context.db).orders.findOne({ _id: id });
  assert.equal(order?.payment.amountRefunded, 9997);
  assert.equal(order?.restockedQuantities[f.sku], 7);
  assert.equal((await product(f.sku)).inventory.stockQuantity, 12);
  await assert.rejects(restockOrder(context, admin, id, { ...mutation(order!.version), returnedAndSellable: true,
    items: [{ sku: f.sku, quantity: 1 }] }), code('RESTOCK_LIMIT'));
});

test('shipped refund is money-only and physical restock limit aggregates multiple offer lines', async () => {
  const f = await fixture();
  const paid = await createMockOrder(context, f.input);
  const id = new ObjectId(paid.id);
  await collections(context.db).orders.updateOne({ _id: id }, { $set: { 'fulfillment.status': 'shipped' } });
  await refundOrder(context, admin, id, mutation(1));
  assert.equal((await product(f.sku)).inventory.stockQuantity, 5);
  const order = await collections(context.db).orders.findOne({ _id: id });
  await restockOrder(context, admin, id, { ...mutation(order!.version), returnedAndSellable: true,
    items: [{ sku: f.sku, quantity: 7 }] });
  assert.equal((await product(f.sku)).inventory.stockQuantity, 12);
});

test('pack reservations compete on shared inventory and reject aggregate demand above 99 boxes', async () => {
  const f = await fixture(3);

  const reserve = () => reserveOrder(context, { cartFormat: 'packs-v1', creationKeyHash: hashToken(randomToken()),
    guestTokenHash: hashToken(randomToken()), guestAccessExpiresAt: new Date(Date.now() + 3600000),
    expiresAt: new Date(Date.now() + 1800000), livemode: false,
    pricingPolicy: { shipping: 'synthetic', tax: 'synthetic', discount: 'none-v1' },
    items: [{ sku: f.sku, offerId: f.three, quantity: 1, productVersion: 5 }] });

  const outcomes = await Promise.allSettled([reserve(), reserve()]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal((await product(f.sku)).inventory.reservedQuantity, 3);
  const large = await fixture(200);
  await assert.rejects(createMockOrder(context, { ...large.input, items: [
    { sku: large.sku, offerId: large.two, quantity: 49, productVersion: 5 },
    { sku: large.sku, offerId: 'standard', quantity: 2, productVersion: 5 },
  ] }), code('INVALID_QUANTITY'));
  assert.equal((await product(large.sku)).inventory.stockQuantity, 200);
});

test('pack expiration releases all boxes once and never restocks unsold boxes', async () => {
  const f = await fixture();
  const p = provider();
  await assert.rejects(createCheckoutSession(context, f.input, p.stripe), code('STRIPE_CHECKOUT_UNAVAILABLE'));
  await createCheckoutSession(context, f.input, p.stripe);
  const checkout = p.checkout();
  checkout.status = 'expired';

  const event = { id: `evt_${randomUUID()}`, type: 'checkout.session.expired', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.id } } } as Stripe.Event;

  await processStripeEvent(context, event, p.stripe);
  await processStripeEvent(context, event, p.stripe);
  assert.equal((await product(f.sku)).inventory.stockQuantity, 12);
  assert.equal((await product(f.sku)).inventory.reservedQuantity, 0);
});

test('legacy reservation fingerprint and snapshots remain exact on retry after catalog changes', async () => {
  const f = await fixture();

  const input = { creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
    guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000),
    livemode: false, pricingPolicy: { shipping: 'legacy', tax: 'legacy', discount: 'none-v1' as const },
    items: [{ sku: f.sku, quantity: 2, productVersion: 5 }] };

  const result = await reserveOrder(context, input);
  const order = await collections(context.db).orders.findOne({ _id: result.orderId });
  assert.equal(order?.creationRequestHash, requestFingerprint({ items: input.items,
    pricingPolicy: input.pricingPolicy, livemode: false, guestTokenHash: input.guestTokenHash }));
  assert.equal(order?.items[0].offerId, undefined);
  assert.equal(order?.pricingPolicy.catalog, undefined);
  assert.equal(order?.items[0].unitAmount, 1999);
  await updateOffer(context, admin, f.sku, f.two, { ...mutation(5), unitAmount: 3099 });
  assert.equal((await reserveOrder(context, input)).replayed, true);
  assert.deepEqual(await collections(context.db).orders.findOne({ _id: result.orderId }), order);
});

test('notification outbox preserves pack composition and renders sets and boxes without catalog rereads', async () => {
  const old = process.env.APP_ENV;
  process.env.APP_ENV = 'stage';

  try {
    const f = await fixture();
    const result = await createMockOrder(context, f.input);
    const job = await context.db.collection('notificationJobs').findOne({ orderId: new ObjectId(result.id), type: 'order.paid' });
    assert.ok(job);
    assert.equal(job.content.items[0].inventoryQuantity, 4);
    assert.equal(job.content.items[0].offerId, f.two);
    await updateOffer(context, admin, f.sku, f.two, { ...mutation(5), unitAmount: 3099 });
    const email = renderNotificationEmail(job.content);
    assert.match(email.text, /Sets 2 · 4 boxes/);
    assert.match(email.text, /29.99/);
  } finally {
    if (old === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = old;
  }
});
