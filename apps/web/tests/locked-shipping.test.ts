import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

import {
  createCheckoutSession, checkoutSessionSchema, checkoutSessionParameters,
} from '../src/_app/commerce/checkout-session.server';
import { cancelGuestCheckout } from '../src/_app/commerce/checkout-cancellation.server';
import { resolveGuestCheckout } from '../src/_app/commerce/checkout-resolve.server';
import { collections } from '../src/_app/commerce/collections.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createMockOrder } from '../src/_app/commerce/mock-checkout.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { migrateLockedShipping } from '../src/_app/commerce/shipping-migration.server';
import { shippingAddressSchema } from '../src/_app/commerce/shipping-address';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import { syntheticShipping, withShipping } from './helpers/shipping';

import type { CheckoutAttempt } from '../src/_app/commerce/models';
import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;

const envKeys = ['STRIPE_MODE', 'STRIPE_CHEKOUT_DISABLED', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
  'MOCK_CHECKOUT_ENABLED', 'STRIPE_WEBHOOK_SECRET'] as const;

const previousEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

before(async () => {
  Object.assign(process.env, { STRIPE_MODE: 'test', STRIPE_CHEKOUT_DISABLED: 'false', STRIPE_SECRET_KEY: 'sk_test_synthetic',
    STRIPE_PUBLISHABLE_KEY: 'pk_test_synthetic', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic', MOCK_CHECKOUT_ENABLED: 'true' });
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('locked_shipping_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });
after(async () => {
  await context?.client.close(); await replica?.stop();

  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
});

const fixture = async () => {
  const sku = `SHIPPING-${randomUUID().slice(0, 8).toUpperCase()}`;
  await createProduct(context, new ObjectId(), { sku, name: 'Synthetic shipping test', shortDescription: '', unitAmount: 2500,
    stockQuantity: 5, salesEnabled: true, operationId: randomUUID() });

  const input = withShipping({ operationId: randomUUID(), guestToken: randomToken(),
    items: [{ sku, quantity: 1, productVersion: 1 }] });

  const stripe = new Stripe('sk_test_synthetic');
  const customers = new Map<string, Stripe.Customer>();
  const sessions = new Map<string, Stripe.Checkout.Session>();
  const customerRequests: { parameters: Stripe.CustomerCreateParams; key: string }[] = [];
  const sessionRequests: Stripe.Checkout.SessionCreateParams[] = [];
  let loseCustomerResponse = false;
  let crossDeadline = false;

  stripe.customers.create = async (parameters, options) => {
    assert.ok(parameters && options?.idempotencyKey);

    const persisted = await collections(context.db).attempts.findOne({
      'customerProvision.idempotencyKey': options.idempotencyKey,
    });

    assert.deepEqual(persisted?.customerProvision?.parameters, parameters);
    assert.equal(persisted?.customerProvision?.apiVersion, options.apiVersion);
    customerRequests.push({ parameters: structuredClone(parameters), key: options.idempotencyKey });

    const customer = customers.get(options.idempotencyKey) ?? { id: `cus_${randomUUID()}`, object: 'customer',
      shipping: parameters.shipping, metadata: parameters.metadata, livemode: false } as Stripe.Customer;

    customers.set(options.idempotencyKey, customer);

    if (crossDeadline) {
      await collections(context.db).attempts.updateOne({ _id: persisted!._id }, {
        $set: { 'inventoryReservation.expiresAt': new Date(0) },
      });
    }

    if (loseCustomerResponse) { loseCustomerResponse = false; throw new Error('Synthetic lost Customer response'); }

    return customer as Stripe.Response<Stripe.Customer>;
  };

  stripe.checkout.sessions.create = async (parameters, options) => {
    assert.ok(parameters && options?.idempotencyKey);
    const persisted = await collections(context.db).attempts.findOne({ stripeIdempotencyKey: options.idempotencyKey });
    assert.deepEqual(persisted?.stripeRequest?.parameters, parameters);
    assert.equal(parameters.customer, persisted?.customerProvision?.customerId);
    sessionRequests.push(structuredClone(parameters));

    const session = sessions.get(options.idempotencyKey) ?? { id: `cs_test_${randomUUID()}`, object: 'checkout.session',
      mode: 'payment', ui_mode: 'embedded_page', customer: parameters.customer, livemode: false, status: 'open',
      payment_status: 'unpaid', currency: 'usd', amount_subtotal: 2500, amount_total: 2500,
      metadata: parameters.metadata, client_reference_id: parameters.client_reference_id, expires_at: parameters.expires_at,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
      automatic_tax: { enabled: true, status: 'complete' }, payment_intent: null } as Stripe.Checkout.Session;

    sessions.set(options.idempotencyKey, session);
    return session as Stripe.Response<Stripe.Checkout.Session>;
  };

  stripe.checkout.sessions.retrieve = async id => {
    const checkout = [...sessions.values()].find(session => session.id === id)!;
    return checkout as Stripe.Response<Stripe.Checkout.Session>;
  };

  return { sku, input, stripe, customers, sessions, customerRequests, sessionRequests,
    loseCustomer: () => { loseCustomerResponse = true; }, crossDeadline: () => { crossDeadline = true; } };
};

test('normalization accepts contiguous US/DC and rejects excluded states, territories, controls and malformed ZIPs', () => {
  const normalized = shippingAddressSchema.parse({ ...syntheticShipping, state: ' ny ', line1: ' 123 Synthetic Street ' });
  assert.deepEqual(normalized, syntheticShipping);
  assert.equal(shippingAddressSchema.safeParse({ ...syntheticShipping, state: 'DC', postalCode: '20001-1234' }).success, true);
  assert.equal(shippingAddressSchema.safeParse({ ...syntheticShipping, postalCode: '00501' }).success, true);
  assert.equal(shippingAddressSchema.safeParse({ ...syntheticShipping, state: 'CA', postalCode: '96101' }).success, true);

  for (const state of ['AK', 'HI', 'PR', 'GU', 'VI', 'AS', 'MP', 'AA', 'AE', 'AP', 'XX']) {
    assert.equal(shippingAddressSchema.safeParse({ ...syntheticShipping, state }).success, false);
  }

  for (const patch of [{ postalCode: '99501' }, { postalCode: '96799' }, { postalCode: '00901' },
    { country: 'CA' }, { postalCode: '1000' }, { line1: 'bad\naddress' },
    { recipientName: ' ' }, { city: 'x'.repeat(101) }]) {
    assert.equal(shippingAddressSchema.safeParse({ ...syntheticShipping, ...patch }).success, false);
  }
});

test('invalid delivery and legacy formats cannot reserve or contact providers', async () => {
  const f = await fixture();

  for (const state of ['AK', 'HI', 'PR']) {
    const invalid = { ...f.input, shippingAddress: { ...syntheticShipping, state } };
    assert.equal(checkoutSessionSchema.safeParse(invalid).success, false);
    await assert.rejects(createCheckoutSession(context, invalid as typeof f.input, f.stripe));
    await assert.rejects(createMockOrder(context, invalid as typeof f.input));
  }

  const legacy = { operationId: f.input.operationId, guestToken: f.input.guestToken,
    items: [{ sku: f.sku, quantity: 1, productVersion: 1 }] };

  await assert.rejects(createCheckoutSession(context, legacy, f.stripe), hasCode('CHECKOUT_RELOAD_REQUIRED'));
  await assert.rejects(createMockOrder(context, legacy), hasCode('CHECKOUT_RELOAD_REQUIRED'));
  await assert.rejects(createCheckoutSession(context, { ...legacy, cartFormat: 'packs-v1', items: f.input.items }, f.stripe),
    hasCode('CHECKOUT_RELOAD_REQUIRED'));
  assert.equal(await collections(context.db).orders.countDocuments({ 'items.sku': f.sku }), 0);
  assert.equal(f.customerRequests.length, 0);
  assert.equal(f.sessionRequests.length, 0);
});

test('lost Customer response retries exact frozen request; normalized address is immutable across replay', async () => {
  const f = await fixture(); f.loseCustomer();
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  assert.equal(f.sessionRequests.length, 0);
  const attempt = await collections(context.db).attempts.findOne({ 'quoteSnapshot.items.sku': f.sku });
  assert.equal(attempt?.customerProvision?.state, 'pending');
  assert.equal(attempt?.stripeRequest, undefined);
  const result = await createCheckoutSession(context, f.input, f.stripe);
  assert.equal(result.replayed, true);
  assert.equal(f.customers.size, 1);
  assert.deepEqual(f.customerRequests[0], f.customerRequests[1]);
  const parameters = f.sessionRequests[0];
  assert.equal(parameters.shipping_address_collection, undefined);
  assert.equal(parameters.customer_creation, undefined);
  assert.deepEqual(parameters.customer_update, { shipping: 'never' });
  assert.equal(parameters.payment_intent_data?.shipping, undefined);
  assert.equal(parameters.automatic_tax?.enabled, true);
  await assert.rejects(createCheckoutSession(context, { ...f.input,
    shippingAddress: { ...syntheticShipping, city: 'Changed destination' } }, f.stripe), hasCode('IDEMPOTENCY_CONFLICT'));
  const order = await collections(context.db).orders.findOne({ _id: new ObjectId(result.id) });
  assert.deepEqual(order?.shippingAddress, syntheticShipping);
  assert.equal(order?.salesTerms, undefined);
});

test('concurrent requests share one dedicated Customer, order, reservation and Session', async () => {
  const f = await fixture();

  const results = await Promise.all([createCheckoutSession(context, f.input, f.stripe),
    createCheckoutSession(context, f.input, f.stripe)]);

  assert.equal(results[0].id, results[1].id);
  assert.equal(f.customers.size, 1);
  assert.equal(f.sessions.size, 1);
  const row = await collections(context.db).products.findOne({ sku: f.sku });
  assert.equal(row?.inventory.reservedQuantity, 1);
});

test('ambiguous Customer past original deadline stays held and never creates replacement provider objects', async () => {
  const f = await fixture(); f.loseCustomer();
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  await collections(context.db).attempts.updateOne({ 'quoteSnapshot.items.sku': f.sku }, {
    $set: { 'inventoryReservation.expiresAt': new Date(0) },
  });
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  assert.equal(f.customerRequests.length, 1);
  assert.equal(f.sessionRequests.length, 0);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);
  const resolved = await resolveGuestCheckout(context, { operationId: f.input.operationId, guestToken: f.input.guestToken });
  assert.deepEqual(Object.keys(resolved), ['id']);
  await cancelGuestCheckout(context, resolved.id, f.input.guestToken, f.stripe);
  await cancelGuestCheckout(context, resolved.id, f.input.guestToken, f.stripe);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 0);
  assert.equal(f.sessionRequests.length, 0);
});

test('inclusive tax preserves gross amounts and locked destination through duplicate billing-change events', async () => {
  for (const includedTax of [0, 185]) {
    const f = await fixture();
    const result = await createCheckoutSession(context, f.input, f.stripe);
    const checkout = [...f.sessions.values()][0];
    Object.assign(checkout, { status: 'complete', payment_status: 'paid',
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: includedTax },
      customer_details: { email: 'synthetic@example.test', name: 'Different billing name', address: { state: 'AK' } },
      collected_information: null,
      payment_intent: { id: `pi_${randomUUID()}`, livemode: false, status: 'succeeded', currency: 'usd',
        amount: 2500, amount_received: 2500 } });

    const event = { id: `evt_${randomUUID()}`, type: 'checkout.session.completed', livemode: false,
      created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.id } } } as Stripe.Event;

    await processStripeEvent(context, event, f.stripe);
    await processStripeEvent(context, event, f.stripe);
    const order = await collections(context.db).orders.findOne({ _id: new ObjectId(result.id) });
    assert.equal(order?.payment.status, 'paid');
    assert.equal(order?.payment.reconciliationRequired, false);
    assert.deepEqual(order?.shippingAddress, syntheticShipping);
    assert.equal(order?.pricing.total, 2500);
    assert.equal(order?.pricing.tax, 0);
    assert.equal(order?.pricing.includedTax, includedTax);
    const attempt = await collections(context.db).attempts.findOne({ orderId: order!._id });
    assert.equal(attempt?.quoteSnapshot.pricing.includedTax, undefined);
    assert.equal(attempt?.quoteSnapshot.pricing.total, 2500);
  }
});

test('v1 persisted pack checkout replays its original frozen request without creating a Customer', async () => {
  const f = await fixture();

  const input = { operationId: f.input.operationId, guestToken: f.input.guestToken,
    cartFormat: 'packs-v1' as const, items: f.input.items };

  const createStripeRequest = (attempt: CheckoutAttempt) => ({
    apiVersion: Stripe.API_VERSION, parameters: checkoutSessionParameters(attempt),
  });

  await reserveOrder(context, { cartFormat: 'packs-v1', items: input.items,
    creationKeyHash: hashToken(`stripe:${input.guestToken}:${input.operationId}`), guestTokenHash: hashToken(input.guestToken),
    guestAccessExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 1800000),
    checkoutMode: 'stripe', livemode: false,
    pricingPolicy: { shipping: 'included-us-v1', tax: 'included-v1', discount: 'none-v1' } }, { createStripeRequest });
  const result = await createCheckoutSession(context, input, f.stripe);
  assert.equal(result.replayed, true);
  assert.equal(f.customers.size, 0);
  assert.deepEqual(f.sessionRequests[0].shipping_address_collection, { allowed_countries: ['US'] });
});

test('migration is repeatable and guards partial provision state and impossible included tax', async () => {
  const f = await fixture();
  const result = await createCheckoutSession(context, f.input, f.stripe);
  const order = await collections(context.db).orders.findOne({ _id: new ObjectId(result.id) });
  const attempt = await collections(context.db).attempts.findOne({ orderId: order!._id });
  await migrateLockedShipping(context.db);
  assert.deepEqual(await collections(context.db).orders.findOne({ _id: order!._id }), order);
  assert.deepEqual(await collections(context.db).attempts.findOne({ _id: attempt!._id }), attempt);
  await assert.rejects(collections(context.db).attempts.updateOne({ _id: attempt!._id }, {
    $unset: { 'customerProvision.customerId': '' },
  }));
  await assert.rejects(collections(context.db).orders.updateOne({ _id: order!._id }, {
    $set: { 'pricing.includedTax': 2501 },
  }));
});

test('wrong Customer and incomplete automatic tax cannot settle a v2 payment', async () => {
  const f = await fixture();
  const result = await createCheckoutSession(context, f.input, f.stripe);
  const checkout = [...f.sessions.values()][0];
  Object.assign(checkout, { status: 'complete', payment_status: 'paid',
    customer_details: { email: 'synthetic@example.test', name: 'Synthetic Buyer' }, collected_information: null,
    payment_intent: { id: `pi_${randomUUID()}`, livemode: false, status: 'succeeded', currency: 'usd',
      amount: 2500, amount_received: 2500 } });
  const customer = checkout.customer;
  checkout.customer = 'cus_wrong';

  const event = () => ({ id: `evt_${randomUUID()}`, type: 'checkout.session.completed', livemode: false,
    created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.id } } }) as Stripe.Event;

  await assert.rejects(processStripeEvent(context, event(), f.stripe), hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  checkout.customer = customer;
  checkout.automatic_tax.status = 'requires_location_inputs';
  await assert.rejects(processStripeEvent(context, event(), f.stripe), hasCode('PAYMENT_AMOUNT_MISMATCH'));
  const order = await collections(context.db).orders.findOne({ _id: new ObjectId(result.id) });
  assert.equal(order?.payment.status, 'pending');
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);
});

test('cross-deadline Customer response cannot freeze a Session request and permits lookup-only cancellation', async () => {
  const f = await fixture(); f.crossDeadline();
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  const attempt = await collections(context.db).attempts.findOne({ 'quoteSnapshot.items.sku': f.sku });
  assert.equal(attempt?.customerProvision?.state, 'ready');
  assert.equal(attempt?.stripeRequest, undefined);
  assert.equal(attempt?.stripeSessionId, undefined);
  assert.equal(f.sessionRequests.length, 0);
  const resolved = await resolveGuestCheckout(context, { operationId: f.input.operationId, guestToken: f.input.guestToken });
  await cancelGuestCheckout(context, resolved.id, f.input.guestToken, f.stripe);
  await cancelGuestCheckout(context, resolved.id, f.input.guestToken, f.stripe);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 0);
  assert.equal(f.customerRequests.length, 1);
  assert.equal(f.sessionRequests.length, 0);
});

test('checkout identity lookup is scoped to operation, guest ownership and access expiry without provider work', async () => {
  const f = await fixture(); f.loseCustomer();
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const input = { operationId: f.input.operationId, guestToken: f.input.guestToken };
  const resolved = await resolveGuestCheckout(context, input);
  await assert.rejects(resolveGuestCheckout(context, { ...input, guestToken: randomToken() }), hasCode('CHECKOUT_NOT_READY'));
  await assert.rejects(resolveGuestCheckout(context, { ...input, operationId: randomUUID() }), hasCode('CHECKOUT_NOT_READY'));
  await collections(context.db).orders.updateOne({ _id: new ObjectId(resolved.id) }, {
    $set: { 'guestAccess.expiresAt': new Date(0) },
  });
  await assert.rejects(resolveGuestCheckout(context, input), hasCode('CHECKOUT_NOT_READY'));
  assert.equal(f.customerRequests.length, 1);
  assert.equal(f.sessionRequests.length, 0);
  const { POST } = await import('../app/api/checkout/resolve/route');

  const denied = await POST(new Request('http://localhost/api/checkout/resolve', {
    method: 'POST', headers: { origin: 'https://outside.example.test', 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }));

  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('cache-control'), 'no-store');

  const malformed = await POST(new Request('http://localhost/api/checkout/resolve', {
    method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json' },
    body: JSON.stringify({ operationId: input.operationId, guestToken: 'bad' }),
  }));

  assert.equal(malformed.status, 400);
});

const rejectedSessionFixture = async () => {
  const f = await fixture();
  f.stripe.checkout.sessions.create = async () => { throw new Error('Synthetic lost response'); };
  await assert.rejects(createCheckoutSession(context, f.input, f.stripe), hasCode('STRIPE_CHECKOUT_UNAVAILABLE'));
  const attempt = (await collections(context.db).attempts.findOne({ 'quoteSnapshot.items.sku': f.sku }))!;

  const parameters = { ...attempt.stripeRequest!.parameters, payment_intent_data: {
    ...attempt.stripeRequest!.parameters.payment_intent_data,
    shipping: { name: 'Synthetic recipient', address: { line1: '123 Example St', city: 'New York',
      state: 'NY', postal_code: '10001', country: 'US' } },
  } };

  await collections(context.db).attempts.updateOne({ _id: attempt._id }, {
    $set: { 'stripeRequest.parameters': parameters },
  });
  return { ...f, attempt, parameters };
};

const knownRejection = () => Object.assign(new Stripe.errors.StripeInvalidRequestError({
  type: 'invalid_request_error',
  message: 'You cannot enable automatic tax calculation with `payment_intent_data[shipping]` set.',
}), { statusCode: 400, requestId: 'req_synthetic', rawType: 'invalid_request_error' });

test('explicit cancellation confirms exact rejection, releases once and preserves frozen payload', async () => {
  const f = await rejectedSessionFixture();
  let calls = 0;

  f.stripe.checkout.sessions.create = async (parameters, options) => {
    calls++;
    assert.deepEqual(parameters, f.parameters);
    assert.equal(options?.idempotencyKey, f.attempt.stripeIdempotencyKey);
    assert.equal(options?.apiVersion, f.attempt.stripeRequest!.apiVersion);
    throw knownRejection();
  };

  const cancel = () => cancelGuestCheckout(context, f.attempt.orderId.toHexString(), f.input.guestToken, f.stripe);
  assert.deepEqual(await cancel(), { cancelled: true });
  assert.deepEqual(await cancel(), { cancelled: true });
  assert.equal(calls, 1);
  const current = (await collections(context.db).attempts.findOne({ _id: f.attempt._id }))!;
  assert.equal(current.state, 'cancelled');
  assert.deepEqual(current.stripeRequest!.parameters, f.parameters);
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 0);
});

test('unknown result and concurrent frozen-request change retain reservations', async () => {
  const f = await rejectedSessionFixture();
  f.stripe.checkout.sessions.create = async () => { throw new Error('Unknown provider result'); };
  const cancel = () => cancelGuestCheckout(context, f.attempt.orderId.toHexString(), f.input.guestToken, f.stripe);
  await assert.rejects(cancel(), hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);

  f.stripe.checkout.sessions.create = async () => {
    await collections(context.db).attempts.updateOne({ _id: f.attempt._id }, {
      $set: { 'stripeRequest.parameters.locale': 'fr' },
    });
    throw knownRejection();
  };

  await assert.rejects(cancel(), hasCode('CHECKOUT_NOT_READY'));
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);
});

test('aged rejected requests require reconciliation without provider replay', async () => {
  const f = await rejectedSessionFixture();
  await collections(context.db).attempts.updateOne({ _id: f.attempt._id }, {
    $set: { createdAt: new Date(Date.now() - 24 * 3600000) },
  });
  f.stripe.checkout.sessions.create = async () => { assert.fail('Must not replay a potentially pruned key'); };
  await assert.rejects(cancelGuestCheckout(context, f.attempt.orderId.toHexString(), f.input.guestToken, f.stripe),
    hasCode('CHECKOUT_RECOVERY_REQUIRED'));
  assert.equal((await collections(context.db).products.findOne({ sku: f.sku }))?.inventory.reservedQuantity, 1);
});
