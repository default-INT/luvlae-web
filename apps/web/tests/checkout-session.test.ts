import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Stripe from 'stripe';

import {
  associateRecoveredCheckoutSession, checkoutSessionParameters, createCheckoutSession, findGuestCheckout, getGuestCheckout,
} from '../src/_app/commerce/checkout-session.server';
import { cancelGuestCheckout } from '../src/_app/commerce/checkout-cancellation.server';
import { collections } from '../src/_app/commerce/collections.server';
import { createProductSchema } from '../src/_app/commerce/contracts';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { stripeRequestMigrationName } from '../src/_app/commerce/stripe-request-migration.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;

const envKeys = ['STRIPE_MODE', 'STRIPE_CHEKOUT_DISABLED', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET'] as const;

const oldEnvironment = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const adminId = new ObjectId();
const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

before(async () => {
  process.env.STRIPE_MODE = 'test';
  process.env.STRIPE_CHEKOUT_DISABLED = 'false';
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_synthetic';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('checkout_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();

  for (const key of envKeys) {
    if (oldEnvironment[key] === undefined) delete process.env[key];
    else process.env[key] = oldEnvironment[key];
  }
});

const fixture = async (sku: string, quantity = 1, stock = 5) => {
  await createProduct(context, adminId, createProductSchema.parse({
    sku, name: 'Synthetic checkout item', shortDescription: '', unitAmount: 2599,
    stockQuantity: stock, salesEnabled: true, operationId: randomUUID(),
  }));

  const input = { operationId: randomUUID(), guestToken: randomToken(), items: [{ sku, quantity, productVersion: 1 }] };
  const stripe = new Stripe('sk_test_synthetic');
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const requests: { parameters: Stripe.Checkout.SessionCreateParams; key: string; apiVersion?: string }[] = [];
  let creates = 0;
  let retrieves = 0;
  let timeoutAfterCreation = false;

  stripe.checkout.sessions.create = async (parameters, options) => {
    assert.ok(parameters);
    const key = options?.idempotencyKey;
    assert.ok(key);
    const persisted = await collections(context.db).attempts.findOne({ stripeIdempotencyKey: key });
    assert.ok(persisted?.stripeRequest, 'provider calls require an already committed request snapshot');
    assert.deepEqual(parameters, persisted.stripeRequest.parameters);
    assert.equal(options?.apiVersion, persisted.stripeRequest.apiVersion);
    const request = { parameters: structuredClone(parameters), key, apiVersion: options?.apiVersion };
    const previousRequest = requests.find(item => item.key === key);

    if (previousRequest) assert.deepEqual(request, previousRequest, 'Stripe rejects changed idempotent request parameters');

    requests.push(request);
    let checkout = sessions.get(key);

    if (!checkout) {
      creates++;
      const total = parameters.line_items!.reduce((sum, item) => sum + item.price_data!.unit_amount! * item.quantity!, 0);
      checkout = {
        id: `cs_test_${randomUUID()}`, object: 'checkout.session', mode: 'payment', ui_mode: 'embedded_page',
        livemode: false, status: 'open', payment_status: 'unpaid', currency: 'usd',
        metadata: parameters.metadata, client_reference_id: parameters.client_reference_id,
        amount_subtotal: total, amount_total: total, expires_at: parameters.expires_at,
        total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 }, payment_intent: null,
        client_secret: `cs_secret_${randomUUID()}`,
      } as Stripe.Checkout.Session;
      sessions.set(key, checkout);
    }

    if (timeoutAfterCreation) {
      timeoutAfterCreation = false;
      throw new Error('Synthetic timeout after Stripe accepted the request');
    }

    return checkout as Stripe.Response<Stripe.Checkout.Session>;
  };

  stripe.checkout.sessions.retrieve = async id => {
    retrieves++;
    const checkout = [...sessions.values()].find(item => item.id === id);
    assert.ok(checkout);
    return checkout as Stripe.Response<Stripe.Checkout.Session>;
  };

  stripe.checkout.sessions.expire = async id => {
    const checkout = [...sessions.values()].find(item => item.id === id);
    assert.ok(checkout);
    assert.equal(checkout.status, 'open');
    checkout.status = 'expired';
    return checkout as Stripe.Response<Stripe.Checkout.Session>;
  };

  return { input, stripe, requests, sessions, timeout: () => { timeoutAfterCreation = true; },
    stats: () => ({ creates, retrieves }) };
};

test('embedded checkout reserves once with exact server quote, card-only US form and 30-minute expiry', async () => {
  const { input, stripe, requests, stats } = await fixture('CHECKOUT-CONTRACT', 2);
  const before = Date.now();
  const result = await createCheckoutSession(context, input, stripe);
  const replay = await createCheckoutSession(context, input, stripe);
  assert.equal(result.replayed, false);
  assert.deepEqual(replay, { id: result.id, replayed: true });
  assert.equal(stats().creates, 1);
  const { orders, attempts, products } = collections(context.db);
  const order = await orders.findOne({ _id: new ObjectId(result.id) });
  const attempt = await attempts.findOne({ orderId: order!._id });
  assert.ok(attempt);
  assert.equal(order?.checkoutMode, 'stripe');
  assert.equal(order?.payment.status, 'pending');
  assert.deepEqual(order?.pricing, { state: 'final', subtotal: 5198, total: 5198, discount: 0, shipping: 0, tax: 0 });
  assert.deepEqual(attempt.quoteSnapshot.pricing, order?.pricing);
  assert.equal(attempt.inventoryReservation.state, 'held');
  assert.ok(attempt.inventoryReservation.expiresAt.getTime() - before >= 30 * 60 * 1000 - 1000);
  assert.ok(attempt.inventoryReservation.expiresAt.getTime() - before <= 30 * 60 * 1000);
  assert.equal((await products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 2);
  assert.equal((await products.findOne({ sku: input.items[0].sku }))?.inventory.stockQuantity, 5);
  const parameters = requests[0].parameters;
  assert.deepEqual(parameters.allowed_payment_method_types, ['card']);
  assert.equal(parameters.ui_mode, 'embedded_page');
  assert.equal(parameters.redirect_on_completion, 'never');
  assert.equal(parameters.locale, 'en');
  assert.deepEqual(parameters.wallet_options, { link: { display: 'never' } });
  assert.deepEqual(parameters.shipping_address_collection?.allowed_countries, ['US']);
  assert.deepEqual(parameters.name_collection?.individual, { enabled: true, optional: false });
  assert.equal(parameters.customer_email, undefined);
  assert.equal(parameters.automatic_tax?.enabled, false);
  assert.equal(parameters.allow_promotion_codes, false);
  assert.equal(parameters.expires_at! * 1000, attempt.inventoryReservation.expiresAt.getTime());
  assert.equal(parameters.line_items?.[0].price_data?.unit_amount, 2599);
  assert.equal(parameters.metadata?.orderId, result.id);
  assert.equal(parameters.metadata?.attemptId, attempt._id.toHexString());
});

test('concurrent exact requests reuse one order, one reservation and one provider idempotency key', async () => {
  const { input, stripe, stats, requests } = await fixture('CHECKOUT-CONCURRENT', 1, 1);

  const results = await Promise.all([
    createCheckoutSession(context, input, stripe), createCheckoutSession(context, input, stripe),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal(stats().creates, 1);
  assert.equal(new Set(requests.map(request => request.key)).size, 1);
  assert.equal((await collections(context.db).products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 1);
});

test('changed contents conflict and competing buyers cannot oversell', async () => {
  const { input, stripe } = await fixture('CHECKOUT-CONFLICT', 1, 1);
  await createCheckoutSession(context, input, stripe);
  await assert.rejects(createCheckoutSession(context, { ...input,
    items: [{ ...input.items[0], quantity: 2 }] }, stripe), hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(createCheckoutSession(context, { ...input, operationId: randomUUID(), guestToken: randomToken() }, stripe),
    hasCode('OUT_OF_STOCK'));
  assert.equal(await collections(context.db).orders.countDocuments({ 'items.sku': input.items[0].sku }), 1);
});

test('network loss after provider creation recovers with identical immutable parameters despite catalog edits', async () => {
  const { input, stripe, requests, stats, timeout } = await fixture('CHECKOUT-RECOVERY');
  timeout();
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const { products, attempts } = collections(context.db);
  const product = await products.findOne({ sku: input.items[0].sku });
  const attempt = await attempts.findOne({ 'quoteSnapshot.items.sku': input.items[0].sku });
  assert.equal(product?.inventory.reservedQuantity, 1);
  assert.equal(attempt?.state, 'creating');
  assert.equal(attempt?.stripeSessionId, undefined);
  await products.updateOne({ _id: product!._id }, { $set: { 'price.unitAmount': 9999, version: 2 } });
  const replay = await createCheckoutSession(context, input, stripe);
  assert.equal(replay.replayed, true);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(stats().creates, 1);
  assert.equal((await attempts.findOne({ _id: attempt!._id }))?.state, 'open');
});

test('terminal retries cannot create another payable checkout', async () => {
  const { input, stripe, stats } = await fixture('CHECKOUT-TERMINAL');
  const result = await createCheckoutSession(context, input, stripe);
  const { orders, attempts } = collections(context.db);
  await attempts.updateOne({ orderId: new ObjectId(result.id) }, { $set: { active: false, state: 'expired' } });
  await orders.updateOne({ _id: new ObjectId(result.id) }, {
    $set: { 'payment.status': 'expired' }, $unset: { 'payment.activeAttemptId': '' },
  });
  assert.deepEqual(await createCheckoutSession(context, input, stripe), { id: result.id, replayed: true });
  assert.equal(stats().creates, 1);
});

test('ambiguous attempts past original deadline stay held until recovery and cannot create a fresh Session', async () => {
  const { input, stripe, timeout, stats } = await fixture('CHECKOUT-DEADLINE');
  timeout();
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const { attempts, products } = collections(context.db);
  const attempt = await attempts.findOne({ 'quoteSnapshot.items.sku': input.items[0].sku });
  await attempts.updateOne({ _id: attempt!._id }, { $set: { 'inventoryReservation.expiresAt': new Date(0) } });
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  assert.equal((await products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 1);
  assert.equal(stats().creates, 1);
});

test('checkout secrets require unexpired ownership and are never persisted', async () => {
  const { input, stripe, stats } = await fixture('CHECKOUT-GUEST');
  const result = await createCheckoutSession(context, input, stripe);
  const view = await findGuestCheckout(context, result.id, input.guestToken, stripe);
  assert.equal(view?.id, result.id);
  assert.equal(view?.publishableKey, 'pk_test_synthetic');
  assert.match(view!.clientSecret!, /^cs_secret_/);
  assert.equal(view?.paymentStatus, 'pending');
  const calls = stats().retrieves;
  assert.equal(await findGuestCheckout(context, result.id, randomToken(), stripe), null);
  assert.equal(await findGuestCheckout(context, 'invalid', input.guestToken, stripe), null);
  assert.equal(await getGuestCheckout(result.id), null);
  assert.equal(stats().retrieves, calls);
  const { orders, attempts } = collections(context.db);
  const order = await orders.findOne({ _id: new ObjectId(result.id) });
  const attempt = await attempts.findOne({ orderId: order!._id });
  assert.equal(JSON.stringify({ order, attempt }).includes(view!.clientSecret!), false);
  assert.equal(JSON.stringify(view).includes(input.guestToken), false);
  await orders.updateOne({ _id: order!._id }, { $set: { 'guestAccess.expiresAt': new Date(0) } });
  assert.equal(await findGuestCheckout(context, result.id, input.guestToken, stripe), null);
  assert.equal(stats().retrieves, calls);
});

test('binding rejects wrong references, environment, deadline and amounts without overwriting association', async () => {
  const { input, stripe, sessions } = await fixture('CHECKOUT-BINDING');
  const result = await createCheckoutSession(context, input, stripe);
  const attempt = await collections(context.db).attempts.findOne({ orderId: new ObjectId(result.id) });
  const checkout = [...sessions.values()][0];

  const invalid = [
    { ...checkout, id: 'cs_test_other' }, { ...checkout, livemode: true },
    { ...checkout, metadata: { ...checkout.metadata, attemptId: new ObjectId().toHexString() } },
    { ...checkout, amount_total: 1 }, { ...checkout, expires_at: checkout.expires_at + 1 }, { ...checkout, currency: 'eur' },
  ];

  for (const value of invalid) {
    await assert.rejects(associateRecoveredCheckoutSession(context, attempt!._id, value),
      hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  }

  assert.equal((await collections(context.db).attempts.findOne({ _id: attempt!._id }))?.stripeSessionId, checkout.id);
});

test('provider completion hides payable secret without marking the order paid ahead of webhook', async () => {
  const { input, stripe, sessions } = await fixture('CHECKOUT-COMPLETE');
  const result = await createCheckoutSession(context, input, stripe);
  const checkout = [...sessions.values()][0];
  checkout.status = 'complete';
  checkout.payment_status = 'paid';
  const view = await findGuestCheckout(context, result.id, input.guestToken, stripe);
  assert.equal(view?.clientSecret, null);
  assert.equal(view?.status, 'complete');
  assert.equal(view?.paymentStatus, 'pending');
});

test('disabled checkout and wrong-origin route reject before database access', async () => {
  const { POST } = await import('../app/api/checkout/session/route');

  const request = (origin = 'https://test.local') => new Request('https://test.local/api/checkout/session', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}',
  });

  process.env.STRIPE_CHEKOUT_DISABLED = 'true';

  try {
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await POST(request('https://attacker.test'))).status, 403);
  } finally {
    process.env.STRIPE_CHEKOUT_DISABLED = 'false';
  }
});

test('unsupported USD totals roll back reservation before contacting Stripe', async () => {
  const { input, stripe, stats } = await fixture('CHECKOUT-AMOUNT');
  const { products, orders } = collections(context.db);

  for (const amount of [49, 100000000]) {
    await products.updateOne({ sku: input.items[0].sku }, { $set: { 'price.unitAmount': amount } });
    await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('INVALID_CHECKOUT_AMOUNT'));
    assert.equal((await products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 0);
    assert.equal(await orders.countDocuments({ 'items.sku': input.items[0].sku }), 0);
  }

  assert.equal(stats().creates, 0);
});

test('retries use persisted request defaults and API version across application builder changes', async () => {
  const { input, stripe, requests, timeout, stats } = await fixture('CHECKOUT-VERSIONED');
  const now = Math.floor(Date.now() / 1000) * 1000;

  const reserved = await reserveOrder(context, {
    creationKeyHash: hashToken(`stripe:${input.guestToken}:${input.operationId}`),
    guestTokenHash: hashToken(input.guestToken), guestAccessExpiresAt: new Date(now + 30 * 86400000),
    expiresAt: new Date(now + 86400000), checkoutMode: 'stripe', livemode: false,
    pricingPolicy: { shipping: 'included-us-v1', tax: 'included-v1', discount: 'none-v1' }, items: input.items,
  }, { createStripeRequest: attempt => ({
    apiVersion: '2026-08-27.dahlia',
    parameters: { ...checkoutSessionParameters(attempt), locale: 'fr', wallet_options: { link: { display: 'auto' } } },
  }) });

  const attempt = await collections(context.db).attempts.findOne({ _id: reserved.attemptId });
  assert.ok(attempt);
  assert.equal(checkoutSessionParameters(attempt).locale, 'en');
  timeout();
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const result = await createCheckoutSession(context, input, stripe);
  assert.equal(result.id, reserved.orderId.toHexString());
  assert.equal(stats().creates, 1);
  assert.equal(requests[0].parameters.locale, 'fr');
  assert.equal(requests[0].apiVersion, '2026-08-27.dahlia');
  assert.deepEqual(requests[0], requests[1]);
});

test('unbound legacy attempts require recovery, while bound legacy Sessions resume without guessed parameters', async () => {
  const { input, stripe, requests, timeout } = await fixture('CHECKOUT-LEGACY');
  timeout();
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const { attempts } = collections(context.db);
  const attempt = await attempts.findOne({ 'quoteSnapshot.items.sku': input.items[0].sku });
  assert.ok(attempt);
  const savedRequest = attempt.stripeRequest;
  await attempts.updateOne({ _id: attempt._id }, { $unset: { stripeRequest: '' } });
  await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  assert.equal(requests.length, 1);
  await attempts.updateOne({ _id: attempt._id }, { $set: { stripeRequest: savedRequest } });
  const recovered = await createCheckoutSession(context, input, stripe);
  await attempts.updateOne({ _id: attempt._id }, { $unset: { stripeRequest: '' } });
  assert.deepEqual(await createCheckoutSession(context, input, stripe), { id: recovered.id, replayed: true });
  assert.equal(requests.length, 2);
});

test('missing request snapshot migration blocks checkout before reserving stock', async () => {
  const { input, stripe, stats } = await fixture('CHECKOUT-MIGRATION');
  const migrations = context.db.collection('_migrations');
  const migration = await migrations.findOne({ name: stripeRequestMigrationName });
  assert.ok(migration);
  await migrations.deleteOne({ _id: migration._id });

  try {
    await assert.rejects(createCheckoutSession(context, input, stripe), hasCode('DATABASE_NOT_READY'));
    assert.equal((await collections(context.db).products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 0);
    assert.equal(stats().creates, 0);
  } finally {
    await migrations.insertOne(migration);
  }
});

test('guest cancellation closes Stripe, releases stock once and preserves the original order on retry', async () => {
  const { input, stripe, sessions } = await fixture('CHECKOUT-CANCEL', 2);
  const { id } = await createCheckoutSession(context, input, stripe);
  const { orders, attempts, products, transactions } = collections(context.db);
  await Promise.all([cancelGuestCheckout(context, id, input.guestToken, stripe),
    cancelGuestCheckout(context, id, input.guestToken, stripe)]);
  await cancelGuestCheckout(context, id, input.guestToken, stripe);
  assert.equal([...sessions.values()][0].status, 'expired');
  const order = await orders.findOne({ _id: new ObjectId(id) });
  assert.equal(order?.orderStatus, 'cancelled');
  assert.equal(order?.payment.status, 'expired');
  assert.equal(order?.payment.activeAttemptId, undefined);
  assert.equal((await attempts.findOne({ orderId: order!._id }))?.inventoryReservation.state, 'released');
  const product = await products.findOne({ sku: input.items[0].sku });
  assert.equal(product?.inventory.reservedQuantity, 0);
  assert.equal(product?.inventory.stockQuantity, 5);
  assert.equal(await transactions.countDocuments({ orderId: order!._id }), 0);
  const replacement = await createCheckoutSession(context, { ...input, operationId: randomUUID() }, stripe);
  assert.notEqual(replacement.id, id);
});

test('cancellation authenticates ownership before contacting the provider, including expired access', async () => {
  const { input, stripe, stats } = await fixture('CHECKOUT-CANCEL-AUTH');
  const { id } = await createCheckoutSession(context, input, stripe);
  const calls = stats().retrieves;
  await assert.rejects(cancelGuestCheckout(context, id, randomToken(), stripe), hasCode('NOT_FOUND'));
  await assert.rejects(cancelGuestCheckout(context, 'invalid', input.guestToken, stripe), hasCode('NOT_FOUND'));
  await collections(context.db).orders.updateOne({ _id: new ObjectId(id) }, {
    $set: { 'guestAccess.expiresAt': new Date(0) },
  });
  await assert.rejects(cancelGuestCheckout(context, id, input.guestToken, stripe), hasCode('NOT_FOUND'));
  assert.equal(stats().retrieves, calls);
});

test('failed provider expiration leaves the checkout and reservation intact for retry', async () => {
  const { input, stripe } = await fixture('CHECKOUT-CANCEL-FAILURE');
  const { id } = await createCheckoutSession(context, input, stripe);
  stripe.checkout.sessions.expire = async () => { throw new Error('Synthetic network failure'); };
  await assert.rejects(cancelGuestCheckout(context, id, input.guestToken, stripe), hasCode('CHECKOUT_CANCEL_FAILED'));
  const attempt = await collections(context.db).attempts.findOne({ orderId: new ObjectId(id) });
  assert.equal(attempt?.active, true);
  assert.equal(attempt?.inventoryReservation.state, 'held');
  assert.equal((await collections(context.db).products.findOne({ sku: input.items[0].sku }))?.inventory.reservedQuantity, 1);
});

test('payment completion racing cancellation cannot release stock or cancel the order', async () => {
  const { input, stripe, sessions } = await fixture('CHECKOUT-CANCEL-PAID');
  const { id } = await createCheckoutSession(context, input, stripe);

  stripe.checkout.sessions.expire = async () => {
    const checkout = [...sessions.values()][0];
    checkout.status = 'complete';
    checkout.payment_status = 'paid';
    throw new Error('Payment won the race');
  };

  await assert.rejects(cancelGuestCheckout(context, id, input.guestToken, stripe), hasCode('CHECKOUT_CANNOT_CANCEL'));
  const order = await collections(context.db).orders.findOne({ _id: new ObjectId(id) });
  assert.equal(order?.orderStatus, 'open');
  assert.equal((await collections(context.db).attempts.findOne({ orderId: order!._id }))?.inventoryReservation.state, 'held');
});

test('guest cancellation route rejects cross-origin requests and missing credentials before accessing the database', async () => {
  const { POST } = await import('../app/api/orders/[id]/checkout/cancel/route');
  const route = { params: Promise.resolve({ id: new ObjectId().toHexString() }) };

  const request = (origin: string) => new Request('https://test.local/api/orders/id/checkout/cancel', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}',
  });

  const rejected = await POST(request('https://attacker.test'), route);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('cache-control'), 'no-store');
  assert.equal((await POST(request('https://test.local'), route)).status, 404);
});
