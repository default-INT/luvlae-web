import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { login, requireAdmin, sessionCookie } from '../src/_app/commerce/auth.server';
import { collections } from '../src/_app/commerce/collections.server';
import {
  createProductSchema, fulfillmentSchema, quoteSchema, restockSchema, updateProductSchema,
} from '../src/_app/commerce/contracts';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { cancelOrder, restockOrder, updateFulfillment } from '../src/_app/commerce/orders.server';
import { appendPaymentTransaction } from '../src/_app/commerce/payments.server';
import { calculateQuote, createProduct, updateProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { ApiError, readJson, requireOrigin } from '../src/shared/lib/api/index.server';
import { inTransaction } from '../src/shared/lib/mongodb/index.server';
import { hashPassword, hashToken, randomToken, verifyPassword } from '../src/shared/lib/security/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const adminId = new ObjectId();

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('commerce_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();
});

const productInput = (sku: string, stockQuantity = 1) => createProductSchema.parse({
  sku, name: 'Synthetic test product', shortDescription: '', unitAmount: 2500,
  stockQuantity, salesEnabled: true, operationId: randomUUID(),
});

const reservationInput = (sku: string) => ({
  creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
  guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000), livemode: false,
  pricingPolicy: { shipping: 'test-only', tax: 'test-only', discount: 'none-v1' as const },
  items: [{ sku, quantity: 1, productVersion: 1 }],
});

const hasCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

const paidOrder = async (sku: string) => {
  await createProduct(context, adminId, productInput(sku));
  const reserved = await reserveOrder(context, reservationInput(sku));
  assert.ok(reserved.attemptId);
  await inTransaction(context, async session => {
    const { orders, products, attempts } = collections(context.db);
    await products.updateOne({ sku }, { $inc: { 'inventory.stockQuantity': -1, 'inventory.reservedQuantity': -1 } }, { session });
    await attempts.updateOne({ _id: reserved.attemptId }, {
      $set: { state: 'succeeded', active: false, 'inventoryReservation.state': 'committed' },
    }, { session });
    await orders.updateOne({ _id: reserved.orderId }, {
      $set: {
        'payment.status': 'paid', 'payment.settledAttemptId': reserved.attemptId, 'payment.amountPaid': 2500,
        pricing: { state: 'final', subtotal: 2500, discount: 0, shipping: 0, tax: 0, total: 2500 },
        customer: { email: 'synthetic@example.test', name: 'Synthetic buyer' },
        shippingAddress: {
          recipientName: 'Synthetic buyer', line1: 'Test address', city: 'Test city',
          state: 'CA', postalCode: '90001', country: 'US',
        },
      },
      $unset: { 'payment.activeAttemptId': '' },
    }, { session });
  });
  return reserved;
};

test('migrations are repeatable and validators enforce inventory and unique SKU', async () => {
  await migrateCommerce(context.db);
  const input = productInput('VALIDATORS');
  await createProduct(context, adminId, input);
  await assert.rejects(createProduct(context, adminId, { ...input, operationId: randomUUID() }));
  await assert.rejects(collections(context.db).products.updateOne({ sku: input.sku }, {
    $set: { 'inventory.reservedQuantity': 2 },
  }));
  assert.equal((await collections(context.db).products.findOne({ sku: input.sku }))?.inventory.reservedQuantity, 0);
});

test('admin product changes are versioned, idempotent, and audited atomically', async () => {
  await createProduct(context, adminId, productInput('EDIT'));

  const input = updateProductSchema.parse({
    unitAmount: 3500, version: 1, operationId: randomUUID(), reason: 'Test price update',
  });

  await updateProduct(context, adminId, 'EDIT', input);
  assert.equal((await updateProduct(context, adminId, 'EDIT', input)).replayed, true);
  await assert.rejects(updateProduct(context, adminId, 'EDIT', { ...input, unitAmount: 4500 }), hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(
    updateProduct(context, adminId, 'EDIT', { ...input, operationId: randomUUID() }), hasCode('VERSION_CONFLICT'),
  );
  assert.equal(await collections(context.db).audit.countDocuments({ operationId: input.operationId }), 1);
  assert.equal((await collections(context.db).products.findOne({ sku: 'EDIT' }))?.price.unitAmount, 3500);
});

test('competing buyers cannot reserve the last unit twice', async () => {
  await createProduct(context, adminId, productInput('LAST'));

  const results = await Promise.allSettled([
    reserveOrder(context, reservationInput('LAST')), reserveOrder(context, reservationInput('LAST')),
  ]);

  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = results.find(result => result.status === 'rejected');
  assert.ok(rejected?.status === 'rejected' && hasCode('OUT_OF_STOCK')(rejected.reason));
  assert.equal((await collections(context.db).products.findOne({ sku: 'LAST' }))?.inventory.reservedQuantity, 1);
  assert.equal(await collections(context.db).orders.countDocuments({ 'items.sku': 'LAST' }), 1);
});

test('multi-item failure rolls back earlier reservations and creates no order', async () => {
  await createProduct(context, adminId, productInput('ROLLBACK-A'));
  await createProduct(context, adminId, productInput('ROLLBACK-B', 0));
  const input = reservationInput('ROLLBACK-A');
  input.items.push({ sku: 'ROLLBACK-B', quantity: 1, productVersion: 1 });
  await assert.rejects(reserveOrder(context, input), hasCode('OUT_OF_STOCK'));
  assert.equal((await collections(context.db).products.findOne({ sku: 'ROLLBACK-A' }))?.inventory.reservedQuantity, 0);
  assert.equal(await collections(context.db).orders.countDocuments({ creationKeyHash: input.creationKeyHash }), 0);
});

test('reservation retries preserve snapshots and stock reductions cannot steal held units', async () => {
  await createProduct(context, adminId, productInput('RESERVE', 2));
  const input = reservationInput('RESERVE');
  const first = await reserveOrder(context, input);
  const retry = await reserveOrder(context, input);
  assert.equal(first.orderId.toHexString(), retry.orderId.toHexString());
  assert.equal(retry.replayed, true);
  await assert.rejects(updateProduct(context, adminId, 'RESERVE', updateProductSchema.parse({
    stockQuantity: 0, version: 1, operationId: randomUUID(), reason: 'Invalid stock reduction',
  })), hasCode('STOCK_RESERVED'));
  await updateProduct(context, adminId, 'RESERVE', updateProductSchema.parse({
    unitAmount: 4000, version: 1, operationId: randomUUID(), reason: 'New catalog price',
  }));
  const order = await collections(context.db).orders.findOne({ _id: first.orderId });
  assert.equal(order?.items[0].unitAmount, 2500);
  assert.equal(order?.pricing.total, null);
  assert.equal(await collections(context.db).attempts.countDocuments({ orderId: first.orderId, active: true }), 1);
});

test('quote rejects browser-supplied prices, duplicate SKUs, and unsafe amounts', async () => {
  assert.equal(quoteSchema.safeParse({ items: [{ sku: 'A', quantity: 1, unitAmount: 1 }] }).success, false);
  assert.equal(quoteSchema.safeParse({ items: [{ sku: 'A', quantity: 1 }, { sku: 'A', quantity: 1 }] }).success, false);
  await createProduct(context, adminId, { ...productInput('OVERFLOW', 99), unitAmount: Number.MAX_SAFE_INTEGER });
  await assert.rejects(calculateQuote(context, { items: [{ sku: 'OVERFLOW', quantity: 2 }] }), hasCode('INVALID_AMOUNT'));
});

test('financial observations are immutable, deduplicated, associated, and rolled back with failed operations', async () => {
  const order = await paidOrder('LEDGER');
  assert.ok(order.attemptId);
  const now = new Date();

  const event = {
    _id: new ObjectId(), schemaVersion: 1, provider: 'stripe' as const, eventId: 'evt_test_ledger',
    eventType: 'payment_intent.succeeded', providerObjectId: 'pi_test', livemode: false,
    orderId: order.orderId, attemptId: order.attemptId, providerCreatedAt: now, receivedAt: now,
    status: 'pending' as const, processingAttempts: 0, nextAttemptAt: now,
  };

  const value = {
    operationId: 'ledger-test', orderId: order.orderId, attemptId: order.attemptId, provider: 'stripe' as const,
    providerObjectId: 'pi_test', providerEventId: event.eventId, type: 'payment' as const, status: 'succeeded' as const,
    amount: 2500, currency: 'USD' as const, livemode: false, occurredAt: now,
  };

  await collections(context.db).events.insertOne(event);
  await assert.rejects(inTransaction(context, async session => {
    await appendPaymentTransaction(context.db, session, value);
    throw new Error('Simulated downstream failure');
  }));
  assert.equal(await collections(context.db).transactions.countDocuments({ operationId: value.operationId }), 0);
  const id = await inTransaction(context, session => appendPaymentTransaction(context.db, session, value));
  const retry = await inTransaction(context, session => appendPaymentTransaction(context.db, session, value));
  assert.equal(id.toHexString(), retry.toHexString());
  await assert.rejects(inTransaction(context, session => appendPaymentTransaction(context.db, session, {
    ...value, amount: 1,
  })), hasCode('IDEMPOTENCY_CONFLICT'));
  await assert.rejects(inTransaction(context, session => appendPaymentTransaction(context.db, session, {
    ...value, operationId: 'wrong-environment', livemode: true,
  })), hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
});

test('fulfillment enforces transitions and creates a single shipping notification', async () => {
  const order = await paidOrder('SHIP');
  await assert.rejects(updateFulfillment(context, adminId, order.orderId, fulfillmentSchema.parse({
    version: 1, operationId: randomUUID(), status: 'shipped', carrier: 'Test carrier', trackingNumber: 'TEST',
  })), hasCode('INVALID_TRANSITION'));
  await updateFulfillment(context, adminId, order.orderId, {
    version: 1, operationId: randomUUID(), status: 'processing',
  });

  const shipping = fulfillmentSchema.parse({
    version: 2, operationId: randomUUID(), status: 'shipped', carrier: 'Test carrier', trackingNumber: 'TEST',
  });

  await updateFulfillment(context, adminId, order.orderId, shipping);
  await updateFulfillment(context, adminId, order.orderId, shipping);
  assert.equal((await collections(context.db).orders.findOne({ _id: order.orderId }))?.notifications.length, 1);
});

test('restocking is explicit, idempotent, and bounded by purchased quantity', async () => {
  const order = await paidOrder('RESTOCK');
  await cancelOrder(context, adminId, order.orderId, { version: 1, operationId: randomUUID(), reason: 'Test cancellation' });

  const input = restockSchema.parse({
    version: 2, operationId: randomUUID(), reason: 'Cancelled before shipment', returnedAndSellable: false,
    items: [{ sku: 'RESTOCK', quantity: 1 }],
  });

  await restockOrder(context, adminId, order.orderId, input);
  await restockOrder(context, adminId, order.orderId, input);
  await assert.rejects(restockOrder(context, adminId, order.orderId, {
    ...input, version: 3, operationId: randomUUID(),
  }), hasCode('RESTOCK_LIMIT'));
  assert.equal((await collections(context.db).products.findOne({ sku: 'RESTOCK' }))?.inventory.stockQuantity, 1);
});

test('passwords and sessions enforce expiration/revocation without relying on TTL', async () => {
  const password = 'synthetic-test-password-123';
  const passwordHash = await hashPassword(password);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword('incorrect-password', passwordHash), false);
  const now = new Date();

  const user = {
    _id: adminId, schemaVersion: 1, email: 'admin@example.test', emailNormalized: 'admin@example.test',
    passwordHash, status: 'active' as const, sessionVersion: 1, passwordChangedAt: now, createdAt: now, updatedAt: now,
  };

  await collections(context.db).users.insertOne(user);
  const request = new Request('https://test.local/api/admin/auth/login', { method: 'POST' });
  const result = await login(context.db, user.email, password, request);
  const cookie = sessionCookie(result.token, request);
  assert.ok(cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Strict'));
  const authorized = new Request('https://test.local/api/admin/orders', { headers: { cookie } });
  assert.equal((await requireAdmin(context.db, authorized))._id.toHexString(), adminId.toHexString());
  await collections(context.db).sessions.updateOne({ tokenHash: hashToken(result.token) }, {
    $set: { expiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(requireAdmin(context.db, authorized), hasCode('UNAUTHORIZED'));
  assert.ok(await collections(context.db).sessions.findOne({ tokenHash: hashToken(result.token) }));
  const second = await login(context.db, user.email, password, request);
  await collections(context.db).users.updateOne({ _id: adminId }, { $inc: { sessionVersion: 1 } });
  await assert.rejects(requireAdmin(context.db, new Request(authorized, {
    headers: { cookie: sessionCookie(second.token, request) },
  })), hasCode('UNAUTHORIZED'));
});

test('mutations require same origin and JSON bodies reject unknown fields and oversize payloads', async () => {
  assert.throws(() => requireOrigin(new Request('https://test.local/api/admin/products', {
    headers: { origin: 'https://attacker.test' },
  })), hasCode('INVALID_ORIGIN'));
  await assert.rejects(readJson(new Request('https://test.local', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(16385),
  }), quoteSchema), hasCode('BODY_TOO_LARGE'));
});

test('declared routes reject unauthenticated and cross-origin requests before opening the database', async () => {
  const { listOrders, postProduct, guestOrderStatus, checkoutUnavailable } =
    await import('../src/_app/commerce/handlers.server');

  const response = await listOrders(new Request('https://test.local/api/admin/orders'));
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');

  const mutation = await postProduct(new Request('https://test.local/api/admin/products', {
    method: 'POST', headers: { origin: 'https://attacker.test' },
  }));

  assert.equal(mutation.status, 403);

  const status = await guestOrderStatus(new Request('https://test.local/api/orders/test/status'), {
    params: Promise.resolve({ id: new ObjectId().toHexString() }),
  });

  assert.equal(status.status, 404);

  const checkout = await checkoutUnavailable(new Request('https://test.local/api/checkout/session', {
    method: 'POST', headers: { origin: 'https://test.local' },
  }));

  assert.equal(checkout.status, 503);
});

test('cursor pagination handles equal timestamps without skipping or repeating rows', async () => {
  const { readPage } = await import('../src/_app/commerce/pagination.server');
  const collection = context.db.collection('paginationTest');
  const createdAt = new Date();
  await collection.insertMany(Array.from({ length: 5 }, () => ({ createdAt })));
  const seen = new Set<string>();
  let cursor: string | null = null;

  do {
    const request = new Request(`https://test.local/api?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
    const page = await readPage(collection, request, 'createdAt', {});

    for (const item of page.items) {
      assert.equal(seen.has(item._id.toHexString()), false);
      seen.add(item._id.toHexString());
    }

    cursor = page.nextCursor;
  } while (cursor);

  assert.equal(seen.size, 5);
});

test('distributed login throttling blocks repeated failures across requests', async () => {
  const request = new Request('https://test.local/api/admin/auth/login', { method: 'POST' });

  for (let count = 0; count < 10; count++) {
    await assert.rejects(login(context.db, 'missing-rate-test@example.test', 'wrong-password', request),
      hasCode('INVALID_CREDENTIALS'));
  }

  await assert.rejects(login(context.db, 'missing-rate-test@example.test', 'wrong-password', request), hasCode('RATE_LIMITED'));
});

test('mock checkout is gated, atomic, replayable, and usable by manager without invented Stripe payments', async () => {
  const { createMockOrder } = await import('../src/_app/commerce/mock-checkout.server');
  const { seedTestProduct } = await import('../src/_app/commerce/mock-migration.server');
  const previous = process.env.MOCK_CHECKOUT_ENABLED;

  try {
    const input = { operationId: randomUUID(), guestToken: randomToken(),
      items: [{ sku: 'MOCK-PAID', quantity: 2, productVersion: 1 }] };

    delete process.env.MOCK_CHECKOUT_ENABLED;
    await assert.rejects(createMockOrder(context, input), hasCode('MOCK_CHECKOUT_DISABLED'));
    process.env.MOCK_CHECKOUT_ENABLED = 'true';
    await createProduct(context, adminId, productInput('MOCK-PAID', 2));
    const result = await createMockOrder(context, input);
    const replay = await createMockOrder(context, input);
    assert.equal(result.id, replay.id);
    assert.equal(replay.replayed, true);
    const { orders, products, attempts, transactions } = collections(context.db);
    const order = await orders.findOne({ _id: new ObjectId(result.id) });
    assert.ok(order);
    assert.equal(order.checkoutMode, 'mock');
    assert.equal(order.payment.status, 'paid');
    assert.equal(order.payment.amountPaid, 5000);
    assert.equal(order.pricing.total, 5000);
    assert.equal(order.customer?.email, 'checkout@example.test');
    assert.equal(order.guestAccess.tokenHash, hashToken(input.guestToken));
    assert.equal((await products.findOne({ sku: 'MOCK-PAID' }))?.inventory.stockQuantity, 0);
    assert.equal((await products.findOne({ sku: 'MOCK-PAID' }))?.inventory.reservedQuantity, 0);
    assert.equal(await transactions.countDocuments({ orderId: order._id }), 0);
    assert.equal((await attempts.findOne({ orderId: order._id }))?.inventoryReservation.state, 'committed');
    await assert.rejects(createMockOrder(context, { ...input,
      items: [{ sku: 'MOCK-PAID', quantity: 1, productVersion: 1 }] }), hasCode('IDEMPOTENCY_CONFLICT'));
    await updateFulfillment(context, adminId, order._id, fulfillmentSchema.parse({
      version: 1, operationId: randomUUID(), status: 'processing',
    }));
    await seedTestProduct(context);
    await products.updateOne({ sku: 'LUVLAE-BERBERINE-60' }, { $inc: { 'inventory.stockQuantity': -1 } });
    await seedTestProduct(context);
    assert.equal((await products.findOne({ sku: 'LUVLAE-BERBERINE-60' }))?.inventory.stockQuantity, 99);
  } finally {
    if (previous === undefined) delete process.env.MOCK_CHECKOUT_ENABLED;
    else process.env.MOCK_CHECKOUT_ENABLED = previous;
  }
});

test('mock checkout prevents overselling and rolls back all items when a price changes', async () => {
  const { createMockOrder } = await import('../src/_app/commerce/mock-checkout.server');
  const previous = process.env.MOCK_CHECKOUT_ENABLED;
  process.env.MOCK_CHECKOUT_ENABLED = 'true';

  const input = (sku: string) => ({ operationId: randomUUID(), guestToken: randomToken(),
    items: [{ sku, quantity: 1, productVersion: 1 }] });

  try {
    await createProduct(context, adminId, productInput('MOCK-RACE'));

    const results = await Promise.allSettled([
      createMockOrder(context, input('MOCK-RACE')), createMockOrder(context, input('MOCK-RACE')),
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal((await collections(context.db).products.findOne({ sku: 'MOCK-RACE' }))?.inventory.stockQuantity, 0);
    await createProduct(context, adminId, productInput('MOCK-ROLLBACK'));

    const request = { ...input('MOCK-ROLLBACK'), items: [
      { sku: 'MOCK-ROLLBACK', quantity: 1, productVersion: 1 },
      { sku: 'MOCK-RACE', quantity: 1, productVersion: 2 },
    ] };

    await assert.rejects(createMockOrder(context, request), hasCode('PRICE_CHANGED'));
    assert.equal((await collections(context.db).products.findOne({ sku: 'MOCK-ROLLBACK' }))?.inventory.stockQuantity, 1);
    assert.equal(await collections(context.db).orders.countDocuments({
      creationKeyHash: hashToken(`mock:${request.guestToken}:${request.operationId}`),
    }), 0);
    await assert.rejects(createMockOrder(context, { ...input('MOCK-ROLLBACK'),
      items: [{ sku: 'MOCK-ROLLBACK', quantity: 100, productVersion: 1 }] }));
  } finally {
    if (previous === undefined) delete process.env.MOCK_CHECKOUT_ENABLED;
    else process.env.MOCK_CHECKOUT_ENABLED = previous;
  }
});

test('SSR guest access is scoped, expires and never returns customer/address or access secrets', async () => {
  const { findGuestOrder, getGuestOrder, guestOrderCookie } = await import('../src/entities/order/index.server');
  const { createMockOrder } = await import('../src/_app/commerce/mock-checkout.server');
  const previous = process.env.MOCK_CHECKOUT_ENABLED;
  process.env.MOCK_CHECKOUT_ENABLED = 'true';

  try {
    await createProduct(context, adminId, productInput('SSR-ORDER'));
    const token = randomToken();

    const result = await createMockOrder(context, { operationId: randomUUID(), guestToken: token,
      items: [{ sku: 'SSR-ORDER', quantity: 1, productVersion: 1 }] });

    const order = await findGuestOrder(context.db, result.id, token);
    assert.ok(order);
    assert.equal(order.paymentStatus, 'paid');
    assert.equal(order.pricing.subtotal, 2500);
    assert.equal('customer' in order, false);
    assert.equal('shippingAddress' in order, false);
    assert.equal(JSON.stringify(order).includes(token), false);
    assert.equal(await findGuestOrder(context.db, result.id, randomToken()), null);
    assert.equal(await getGuestOrder(result.id), null);
    assert.equal(await getGuestOrder('invalid', token), null);
    const cookie = guestOrderCookie(result.id, token, 'https://test.local/api/checkout/mock');
    assert.match(cookie, new RegExp(`Path=/orders/${result.id};`));
    assert.match(cookie, /HttpOnly; SameSite=Lax; Max-Age=2592000; Secure$/);
    assert.doesNotMatch(guestOrderCookie(result.id, token, 'http://localhost:3002/api/checkout/mock'), /; Secure/);
    assert.throws(() => guestOrderCookie('invalid', token, 'https://test.local'));
    await collections(context.db).orders.updateOne({ _id: new ObjectId(result.id) }, {
      $set: { 'guestAccess.expiresAt': new Date(0) },
    });
    assert.equal(await findGuestOrder(context.db, result.id, token), null);
  } finally {
    if (previous === undefined) delete process.env.MOCK_CHECKOUT_ENABLED;
    else process.env.MOCK_CHECKOUT_ENABLED = previous;
  }
});

test('Stripe verifies raw signatures and rejects tampering, stale signatures, live events and oversized bodies', async () => {
  const { default: Stripe } = await import('stripe');
  const { verifyStripeEvent } = await import('../src/shared/lib/stripe/index.server');
  const { POST } = await import('../app/api/webhooks/stripe/route');
  const stripe = new Stripe('sk_test_synthetic');
  const oldSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const oldKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_synthetic';
  process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic';

  const payload = JSON.stringify({ id: 'evt_signed', type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000), livemode: false, data: { object: { id: 'cs_test_signed' } } });

  const signed = (body = payload, timestamp?: number) => new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST', body, headers: { 'Stripe-Signature': stripe.webhooks.generateTestHeaderString({
      payload, secret: 'whsec_synthetic', timestamp,
    }) },
  });

  try {
    assert.equal((await verifyStripeEvent(signed(), stripe)).id, 'evt_signed');
    await assert.rejects(verifyStripeEvent(signed(`${payload} `), stripe), hasCode('INVALID_STRIPE_SIGNATURE'));
    await assert.rejects(verifyStripeEvent(signed(payload, 1), stripe), hasCode('INVALID_STRIPE_SIGNATURE'));
    await assert.rejects(verifyStripeEvent(signed('x'.repeat(262145)), stripe), hasCode('BODY_TOO_LARGE'));
    const unsigned = new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: payload });
    assert.equal((await POST(unsigned)).status, 400);
    const live = payload.replace('"livemode":false', '"livemode":true');

    const request = new Request('http://localhost/api/webhooks/stripe', { method: 'POST', body: live,
      headers: { 'Stripe-Signature': stripe.webhooks.generateTestHeaderString({ payload: live, secret: 'whsec_synthetic' }) } });

    await assert.rejects(verifyStripeEvent(request, stripe), hasCode('STRIPE_ENVIRONMENT_MISMATCH'));
    process.env.STRIPE_SECRET_KEY = 'sk_live_synthetic';
    assert.equal((await POST(signed())).status, 503);
  } finally {
    if (oldSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = oldSecret;

    if (oldKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = oldKey;
  }
});

test('Stripe Checkout handles duplicates, async payments, expiry/failure, retries and late payments', async () => {
  const { default: Stripe } = await import('stripe');
  const { processStripeEvent } = await import('../src/_app/commerce/stripe-webhook.server');
  const stripe = new Stripe('sk_test_synthetic');
  type Session = import('stripe').Stripe.Checkout.Session;
  type Event = import('stripe').Stripe.Event;
  const { orders, attempts, products, transactions, events } = collections(context.db);

  const fixture = async (sku: string) => {
    await createProduct(context, adminId, productInput(sku, 2));
    const reserved = await reserveOrder(context, reservationInput(sku));
    assert.ok(reserved.attemptId);
    const sessionId = `cs_test_${sku}`;
    await attempts.updateOne({ _id: reserved.attemptId }, { $set: {
      stripeSessionId: sessionId, state: 'open',
      'quoteSnapshot.pricing': { state: 'final', subtotal: 2500, discount: 0, shipping: 100, tax: 50, total: 2650 },
    } });

    const checkout = {
      id: sessionId, object: 'checkout.session', mode: 'payment', livemode: false, status: 'complete', payment_status: 'paid',
      metadata: { orderId: reserved.orderId.toHexString(), attemptId: reserved.attemptId.toHexString() },
      client_reference_id: reserved.orderId.toHexString(), currency: 'usd', amount_subtotal: 2500, amount_total: 2650,
      total_details: { amount_discount: 0, amount_shipping: 100, amount_tax: 50 },
      payment_intent: {
        id: `pi_${sku}`, livemode: false, status: 'succeeded', currency: 'usd', amount: 2650, amount_received: 2650,
      },
      customer_details: { email: 'synthetic@example.test', name: 'Test buyer' },
      collected_information: { shipping_details: { name: 'Test buyer', address: {
        line1: 'Test address', city: 'Test city', state: 'CA', postal_code: '90001', country: 'US',
      } } },
    } as unknown as Session;

    stripe.checkout.sessions.retrieve = async () => checkout as import('stripe').Stripe.Response<Session>;

    const event = (type = 'checkout.session.completed', id = `evt_${randomUUID()}`) => ({
      id, type, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: { id: sessionId } },
    }) as Event;

    return { ...reserved, checkout, event };
  };

  const first = await fixture('STRIPE-PAID');
  const paid = first.event();
  await Promise.all([processStripeEvent(context, paid, stripe), processStripeEvent(context, paid, stripe)]);
  assert.equal((await orders.findOne({ _id: first.orderId }))?.payment.status, 'paid');
  assert.equal((await orders.findOne({ _id: first.orderId }))?.payment.amountPaid, 2650);
  assert.equal((await orders.findOne({ _id: first.orderId }))?.shippingAddress?.country, 'US');
  assert.equal((await products.findOne({ sku: 'STRIPE-PAID' }))?.inventory.stockQuantity, 1);
  assert.equal((await products.findOne({ sku: 'STRIPE-PAID' }))?.inventory.reservedQuantity, 0);
  await processStripeEvent(context, first.event('checkout.session.async_payment_succeeded'), stripe);
  await processStripeEvent(context, first.event('checkout.session.expired'), stripe);
  assert.equal(await transactions.countDocuments({ orderId: first.orderId }), 1);
  assert.equal((await orders.findOne({ _id: first.orderId }))?.payment.status, 'paid');

  const mismatch = await fixture('STRIPE-MISMATCH');
  mismatch.checkout.metadata!.attemptId = new ObjectId().toHexString();
  await assert.rejects(processStripeEvent(context, mismatch.event(), stripe), hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  mismatch.checkout.metadata!.attemptId = mismatch.attemptId!.toHexString();
  mismatch.checkout.currency = 'eur';
  await assert.rejects(processStripeEvent(context, mismatch.event(), stripe), hasCode('PAYMENT_ASSOCIATION_MISMATCH'));
  mismatch.checkout.currency = 'usd';
  mismatch.checkout.amount_total = 1;
  const retry = mismatch.event();
  await assert.rejects(processStripeEvent(context, retry, stripe), hasCode('PAYMENT_AMOUNT_MISMATCH'));
  assert.equal((await orders.findOne({ _id: mismatch.orderId }))?.payment.status, 'pending');
  assert.equal((await products.findOne({ sku: 'STRIPE-MISMATCH' }))?.inventory.reservedQuantity, 1);
  assert.equal((await events.findOne({ eventId: retry.id }))?.status, 'failed');
  mismatch.checkout.amount_total = 2650;
  await processStripeEvent(context, retry, stripe);
  assert.equal((await events.findOne({ eventId: retry.id }))?.status, 'processed');

  const delayed = await fixture('STRIPE-ASYNC');
  delayed.checkout.payment_status = 'unpaid';
  Object.assign(delayed.checkout.payment_intent!, { status: 'processing', amount_received: 0 });
  await processStripeEvent(context, delayed.event(), stripe);
  assert.equal((await orders.findOne({ _id: delayed.orderId }))?.payment.status, 'processing');
  assert.equal((await products.findOne({ sku: 'STRIPE-ASYNC' }))?.inventory.reservedQuantity, 1);
  Object.assign(delayed.checkout.payment_intent!, { status: 'succeeded', amount_received: 2650 });
  delayed.checkout.payment_status = 'paid';
  await processStripeEvent(context, delayed.event('checkout.session.async_payment_succeeded'), stripe);
  assert.equal((await orders.findOne({ _id: delayed.orderId }))?.payment.status, 'paid');

  const expired = await fixture('STRIPE-EXPIRED');
  expired.checkout.status = 'expired';
  expired.checkout.payment_status = 'unpaid';
  expired.checkout.payment_intent = null;
  await processStripeEvent(context, expired.event('checkout.session.expired'), stripe);
  await processStripeEvent(context, expired.event('checkout.session.expired'), stripe);
  assert.equal((await orders.findOne({ _id: expired.orderId }))?.payment.status, 'expired');
  assert.equal((await products.findOne({ sku: 'STRIPE-EXPIRED' }))?.inventory.stockQuantity, 2);
  assert.equal((await products.findOne({ sku: 'STRIPE-EXPIRED' }))?.inventory.reservedQuantity, 0);

  const failure = await fixture('STRIPE-FAILED');
  failure.checkout.payment_status = 'unpaid';
  Object.assign(failure.checkout.payment_intent!, { status: 'requires_payment_method', amount_received: 0 });
  await processStripeEvent(context, failure.event('checkout.session.async_payment_failed'), stripe);
  assert.equal((await orders.findOne({ _id: failure.orderId }))?.payment.status, 'failed');
  assert.equal((await products.findOne({ sku: 'STRIPE-FAILED' }))?.inventory.reservedQuantity, 0);
  failure.checkout.payment_status = 'paid';
  Object.assign(failure.checkout.payment_intent!, { status: 'succeeded', amount_received: 2650 });
  await processStripeEvent(context, failure.event('checkout.session.async_payment_succeeded'), stripe);
  assert.equal((await orders.findOne({ _id: failure.orderId }))?.payment.status, 'paid');
  assert.equal((await orders.findOne({ _id: failure.orderId }))?.payment.reconciliationRequired, true);
  assert.equal((await products.findOne({ sku: 'STRIPE-FAILED' }))?.inventory.stockQuantity, 2);

  const unrelated = await fixture('STRIPE-UNRELATED');
  unrelated.checkout.metadata = {};
  unrelated.checkout.id = 'cs_test_unrelated';
  const unrelatedEvent = unrelated.event();
  Object.assign(unrelatedEvent.data.object, { id: 'cs_test_unrelated' });
  const ignored = await processStripeEvent(context, unrelatedEvent, stripe);
  assert.equal('ignored' in ignored && ignored.ignored, true);
  assert.equal((await orders.findOne({ _id: unrelated.orderId }))?.payment.status, 'pending');
  await processStripeEvent(context, unrelated.event('payment_intent.succeeded'), stripe);
  stripe.checkout.sessions.retrieve = async () => { throw new Error('Synthetic network failure'); };
  await assert.rejects(processStripeEvent(context, unrelated.event(), stripe));
  assert.equal((await products.findOne({ sku: 'STRIPE-UNRELATED' }))?.inventory.reservedQuantity, 1);
});
