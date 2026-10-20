import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, test } from 'node:test';

import { MongoClient, ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import Stripe from 'stripe';

import { collections } from '../src/_app/commerce/collections.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import {
  planCheckoutTransition, validateCheckoutAssociation, validateCheckoutSession,
} from '../src/_app/commerce/stripe-checkout-policy.server';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';
import {
  createStripeClient, getStripeMode, requireStripeCheckoutConfiguration, verifyStripeEvent,
} from '../src/shared/lib/stripe/index.server';

import type { CheckoutAttempt, Order } from '../src/_app/commerce/models';
import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

const environmentNames = [
  'STRIPE_MODE', 'STRIPE_CHEKOUT_DISABLED', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
  'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_APP_ENV', 'APP_ENV',
] as const;

let previousEnvironment: (string | undefined)[];

beforeEach(() => {
  previousEnvironment = environmentNames.map(name => process.env[name]);
  environmentNames.forEach(name => { delete process.env[name]; });
});

afterEach(() => environmentNames.forEach((name, index) => {
  const value = previousEnvironment[index];

  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}));

const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

const configure = (mode: 'test' | 'live') => {
  process.env.STRIPE_MODE = mode;
  process.env.STRIPE_CHEKOUT_DISABLED = 'false';
  process.env.STRIPE_SECRET_KEY = `sk_${mode}_synthetic`;
  process.env.STRIPE_PUBLISHABLE_KEY = `pk_${mode}_synthetic`;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  process.env.NEXT_PUBLIC_APP_ENV = mode === 'live' ? 'production' : 'stage';
  process.env.APP_ENV = mode === 'live' ? 'production' : 'stage';
};

test('checkout defaults available with valid keys; only exact true disables it without blocking webhooks', () => {
  configure('test');
  delete process.env.STRIPE_CHEKOUT_DISABLED;
  assert.equal(requireStripeCheckoutConfiguration().mode, 'test');

  for (const value of ['false', '', 'TRUE']) {
    process.env.STRIPE_CHEKOUT_DISABLED = value;
    assert.equal(requireStripeCheckoutConfiguration().mode, 'test');
  }

  process.env.STRIPE_CHEKOUT_DISABLED = 'true';
  assert.throws(requireStripeCheckoutConfiguration, hasCode('CHECKOUT_UNAVAILABLE'));
  delete process.env.STRIPE_PUBLISHABLE_KEY;
  assert.ok(createStripeClient());
  process.env.STRIPE_CHEKOUT_DISABLED = 'false';
  assert.throws(requireStripeCheckoutConfiguration, hasCode('STRIPE_NOT_CONFIGURED'));
});

test('checkout requires matching public/secret keys and fails closed for invalid mode', () => {
  configure('test');
  assert.deepEqual(requireStripeCheckoutConfiguration(), {
    mode: 'test', livemode: false, publishableKey: 'pk_test_synthetic',
  });
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_synthetic';
  assert.throws(requireStripeCheckoutConfiguration, hasCode('STRIPE_NOT_CONFIGURED'));
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_synthetic';
  process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic';
  assert.throws(requireStripeCheckoutConfiguration, hasCode('STRIPE_NOT_CONFIGURED'));
  process.env.STRIPE_MODE = 'sandbox';
  assert.throws(getStripeMode, hasCode('STRIPE_NOT_CONFIGURED'));
});

test('live requires production runtime and build markers, even with a production Node build', () => {
  configure('live');
  assert.equal(requireStripeCheckoutConfiguration().livemode, true);

  for (const marker of ['NEXT_PUBLIC_APP_ENV', 'APP_ENV'] as const) {
    for (const environment of ['stage', 'development', '']) {
      process.env[marker] = environment;
      assert.throws(createStripeClient, hasCode('STRIPE_NOT_CONFIGURED'));
    }

    process.env[marker] = 'production';
  }
});

test('signed webhook rejects the other mode and Connect account events in either configured mode', async () => {
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';

  for (const mode of ['test', 'live'] as const) {
    configure(mode);
    const stripe = createStripeClient();

    const request = (livemode: boolean, account?: string) => {
      const payload = JSON.stringify({
        id: 'evt_synthetic', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
        livemode, ...(account ? { account } : {}), data: { object: { id: 'cs_synthetic' } },
      });

      return new Request('https://example.test/api/webhooks/stripe', {
        method: 'POST', body: payload,
        headers: { 'Stripe-Signature': stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_synthetic' }) },
      });
    };

    const livemode = mode === 'live';
    assert.equal((await verifyStripeEvent(request(livemode), stripe)).livemode, livemode);
    await assert.rejects(verifyStripeEvent(request(!livemode), stripe), hasCode('STRIPE_ENVIRONMENT_MISMATCH'));
    await assert.rejects(verifyStripeEvent(request(livemode, 'acct_other'), stripe), hasCode('STRIPE_ENVIRONMENT_MISMATCH'));
    await assert.rejects(processStripeEvent({} as DatabaseContext, {
      livemode: !livemode,
    } as Stripe.Event, stripe), hasCode('STRIPE_ENVIRONMENT_MISMATCH'));
  }
});

test('session, attempt and expanded intent mode must all match before payment can settle', () => {
  configure('live');
  const orderId = new ObjectId();
  const attemptId = new ObjectId();
  const pricing = { state: 'final', subtotal: 2500, total: 2500, discount: 0, tax: 0, shipping: 0 };

  const order = {
    _id: orderId, checkoutMode: 'stripe', currency: 'USD', orderStatus: 'open',
    payment: { activeAttemptId: attemptId, reconciliationRequired: false },
  } as unknown as Order;

  const attempt = {
    _id: attemptId, orderId, livemode: true, state: 'open', active: true,
    quoteSnapshot: { currency: 'USD', pricing }, inventoryReservation: { state: 'held' },
  } as unknown as CheckoutAttempt;

  const intent = {
    id: 'pi_live_synthetic', livemode: true, currency: 'usd', status: 'succeeded', amount: 2500, amount_received: 2500,
  } as Stripe.PaymentIntent;

  const checkout = {
    id: 'cs_live_synthetic', livemode: true, mode: 'payment', currency: 'usd', status: 'complete', payment_status: 'paid',
    metadata: { orderId: orderId.toHexString(), attemptId: attemptId.toHexString() },
    client_reference_id: orderId.toHexString(), payment_intent: intent, amount_subtotal: 2500, amount_total: 2500,
    total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
  } as unknown as Stripe.Checkout.Session;

  validateCheckoutSession(checkout, checkout.id);
  const context = validateCheckoutAssociation(checkout, attempt, order);
  assert.equal(planCheckoutTransition(context, 'checkout.session.completed')?.paymentStatus, 'paid');
  assert.throws(() => validateCheckoutSession({ ...checkout, livemode: false }, checkout.id),
    hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  assert.throws(() => validateCheckoutAssociation(checkout, { ...attempt, livemode: false }, order),
    hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  const mismatchedIntent = { ...intent, livemode: false };
  assert.throws(() => validateCheckoutAssociation({ ...checkout, payment_intent: mismatchedIntent }, attempt, order),
    hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  assert.throws(() => planCheckoutTransition({ ...context, intent: mismatchedIntent }, 'checkout.session.completed'),
    hasCode('PAYMENT_AMOUNT_MISMATCH'));
});

test('live settlement persists live journal facts and consumes inventory exactly once', async () => {
  configure('live');
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = new MongoClient(replica.getUri());

  try {
    await client.connect();
    const context = { client, db: client.db('stripe_live_synthetic_tests') };
    await migrateCommerce(context.db);
    await createProduct(context, new ObjectId(), {
      sku: 'SYNTHETIC-LIVE-MODE', name: 'Synthetic mode test', shortDescription: '', unitAmount: 2500,
      stockQuantity: 1, salesEnabled: true, operationId: randomUUID(),
    });

    const reserved = await reserveOrder(context, {
      creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
      guestAccessExpiresAt: new Date(Date.now() + 86400000), expiresAt: new Date(Date.now() + 86400000),
      livemode: true, checkoutMode: 'stripe',
      pricingPolicy: { shipping: 'included-us-v1', tax: 'included-v1', discount: 'none-v1' },
      items: [{ sku: 'SYNTHETIC-LIVE-MODE', quantity: 1, productVersion: 1 }],
    });

    assert.ok(reserved.attemptId);
    const { orders, attempts, products, transactions } = collections(context.db);
    await attempts.updateOne({ _id: reserved.attemptId }, { $set: {
      stripeSessionId: 'cs_live_synthetic', state: 'open',
      'quoteSnapshot.pricing': { state: 'final', subtotal: 2500, discount: 0, shipping: 0, tax: 0, total: 2500 },
    } });

    const checkout = {
      id: 'cs_live_synthetic', livemode: true, mode: 'payment', currency: 'usd', status: 'complete', payment_status: 'paid',
      metadata: { orderId: reserved.orderId.toHexString(), attemptId: reserved.attemptId.toHexString() },
      client_reference_id: reserved.orderId.toHexString(), amount_subtotal: 2500, amount_total: 2500,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
      payment_intent: {
        id: 'pi_live_synthetic', livemode: true, currency: 'usd', status: 'succeeded', amount: 2500, amount_received: 2500,
      },
    } as unknown as Stripe.Checkout.Session;

    const stripe = createStripeClient();
    stripe.checkout.sessions.retrieve = async () => checkout as Stripe.Response<Stripe.Checkout.Session>;

    const event = {
      id: 'evt_live_synthetic', type: 'checkout.session.completed', livemode: true,
      created: Math.floor(Date.now() / 1000), data: { object: { id: checkout.id } },
    } as Stripe.Event;

    await processStripeEvent(context, event, stripe);
    await processStripeEvent(context, event, stripe);
    assert.equal((await orders.findOne({ _id: reserved.orderId }))?.payment.status, 'paid');
    assert.equal((await products.findOne({ sku: 'SYNTHETIC-LIVE-MODE' }))?.inventory.stockQuantity, 0);
    assert.equal(await transactions.countDocuments({ orderId: reserved.orderId }), 1);
    assert.equal((await transactions.findOne({ orderId: reserved.orderId }))?.livemode, true);
  } finally {
    await client.close();
    await replica.stop();
  }
});
