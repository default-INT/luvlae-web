import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

import { ObjectId } from 'mongodb';

import type { ProductOffer } from '../src/entities/product';
import type { GuestOrder } from '../src/entities/order';
import type { Db } from 'mongodb';

const originalEnv = {
  measurement: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
  publicEnvironment: process.env.NEXT_PUBLIC_APP_ENV, environment: process.env.APP_ENV,
};

const originals = ['window', 'document', 'localStorage']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);

process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-SEOAUDIT01';
process.env.NEXT_PUBLIC_APP_ENV = 'production';
process.env.APP_ENV = 'production';

const { analyticsLocation, trackEcommerceEvent } = await import('../src/shared/lib/analytics');
const { createCartStore } = await import('../src/features/shopping-cart/model/store');
const { getProductAnalytics } = await import('../src/entities/product');
const { getPurchaseAnalytics } = await import('../src/entities/order');
const { findGuestOrder } = await import('../src/entities/order/index.server');
const storage = new Map<string, string>();
let queue: unknown[][] = [];

const offer: ProductOffer = {
  id: '000000000000000000000001', sku: 'LUVLAE-BERBERINE-60', name: 'Berberine Patches', shortDescription: '',
  price: { currency: 'USD', unitAmount: 1999 }, availableQuantity: 3, salesEnabled: true, version: 1,
};

beforeEach(() => {
  queue = [];
  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  process.env.APP_ENV = 'production';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: new URL('https://www.luvlae.com/orders/000000000000000000000001?token=secret'),
    gtag: (...args: unknown[]) => queue.push(args),
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    title: 'Your order | Luvlae', referrer: 'https://www.luvlae.com/orders/000000000000000000000001/checkout?secret=hidden',
  } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
});

after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }

  for (const [key, value] of Object.entries({
    NEXT_PUBLIC_GA_MEASUREMENT_ID: originalEnv.measurement,
    NEXT_PUBLIC_APP_ENV: originalEnv.publicEnvironment, APP_ENV: originalEnv.environment,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('cart events record actual added/removed quantities and ignore rejected edits', () => {
  const store = createCartStore();
  store.getState().add(offer, 2);
  store.getState().add(offer, 2); // Only one more unit fits in stock.
  store.getState().add(offer, 1); // No inventory left: no add event.
  store.getState().update(offer.sku, 1);
  store.getState().remove(offer.sku);
  const events = queue.filter(row => row[0] === 'event');
  assert.deepEqual(events.map(row => row[1]), [
    'add_to_cart', 'view_cart', 'add_to_cart', 'remove_from_cart', 'remove_from_cart',
  ]);
  assert.deepEqual(events.map(row => (row[2] as { items: { quantity: number }[] }).items[0].quantity), [2, 2, 1, 2, 1]);
  assert.equal((events[0][2] as { value: number }).value, 39.98);
  assert.equal(JSON.stringify(events).includes('secret'), false);
  assert.equal(JSON.stringify(events).includes('000000000000000000000001'), false);
});

test('purchase is queued once with a transaction id, including when persistence is blocked', () => {
  const parameters = { ...getProductAnalytics(offer, 2), transaction_id: 'LUV-TEST-PAID-1' };
  assert.equal(trackEcommerceEvent('purchase', parameters, parameters.transaction_id), true);
  assert.equal(trackEcommerceEvent('purchase', parameters, parameters.transaction_id), false);
  assert.ok(storage.get(`luvlae-analytics:purchase:${parameters.transaction_id}`));
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Blocked'); } });
  const blocked = { ...parameters, transaction_id: 'LUV-TEST-PAID-2' };
  assert.equal(trackEcommerceEvent('purchase', blocked, blocked.transaction_id), true);
  assert.equal(trackEcommerceEvent('purchase', blocked, blocked.transaction_id), false);
  assert.equal(queue.filter(row => row[1] === 'purchase').length, 2);
});

test('persisted purchase receipts suppress a later visit and checkout receipts suppress reloads', () => {
  storage.set('luvlae-analytics:purchase:LUV-ALREADY-SENT', '1');
  const parameters = { ...getProductAnalytics(offer), transaction_id: 'LUV-ALREADY-SENT' };
  assert.equal(trackEcommerceEvent('purchase', parameters, parameters.transaction_id), false);
  assert.equal(trackEcommerceEvent('begin_checkout', getProductAnalytics(offer), 'checkout-1'), true);
  assert.equal(trackEcommerceEvent('begin_checkout', getProductAnalytics(offer), 'checkout-1'), false);
});

test('stage, development and non-production origins never queue commerce events', () => {
  for (const environment of ['stage', 'development', '']) {
    process.env.NEXT_PUBLIC_APP_ENV = environment;
    assert.equal(trackEcommerceEvent('view_item', getProductAnalytics(offer)), false);
  }

  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL('http://localhost:3000') } });
  assert.equal(trackEcommerceEvent('view_item', getProductAnalytics(offer)), false);
  assert.equal(queue.filter(row => row[0] === 'event').length, 0);
});

test('location sanitization removes guest IDs, tokens and query strings', () => {
  assert.equal(analyticsLocation('https://www.luvlae.com/orders/private-id/checkout?token=secret#card'),
    'https://www.luvlae.com/checkout');
  assert.equal(analyticsLocation('https://www.luvlae.com/order/private-id'), 'https://www.luvlae.com/order-status');
});

test('purchase requires a server-authorized live settlement and never uses current catalog prices', () => {
  const order: GuestOrder = {
    orderNumber: 'LUV-SERVER-1', orderStatus: 'open', checkoutMode: 'stripe', currency: 'USD',
    paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled', pricing: { subtotal: 2998, total: 2998 },
    items: [{ sku: offer.sku, name: offer.name, quantity: 2, unitAmount: 1499, lineSubtotal: 2998 }],
    analyticsPurchaseEligible: true,
  };

  const purchase = getPurchaseAnalytics(order)!;
  assert.equal(purchase.value, 29.98);
  assert.equal(purchase.items[0].price, 14.99);
  assert.equal(purchase.transaction_id, order.orderNumber);
  assert.equal(getPurchaseAnalytics({ ...order, analyticsPurchaseEligible: false }), null);
  assert.equal(getPurchaseAnalytics({ ...order, checkoutMode: 'mock' }), null);

  for (const paymentStatus of ['pending', 'processing', 'expired', 'failed']) {
    assert.equal(getPurchaseAnalytics({ ...order, paymentStatus }), null);
  }
});

test('guest projection requires a successful, associated live settlement for purchase analytics', async () => {
  const orderId = new ObjectId();
  const attemptId = new ObjectId();

  const order = {
    _id: orderId, orderNumber: 'LUV-PROJECTION', checkoutMode: 'stripe', currency: 'USD',
    pricing: { subtotal: 1999, total: 1999 }, items: [],
    payment: { status: 'paid', settledAttemptId: attemptId }, fulfillment: { status: 'unfulfilled' },
  };

  let live = true;

  const db = { collection: (name: string) => ({ findOne: async (query: Record<string, unknown>) => {
    if (name === 'orders') return order;

    assert.equal(name, 'checkoutAttempts');
    assert.deepEqual(query, { _id: attemptId, orderId, state: 'succeeded', livemode: true });
    return live ? { _id: attemptId } : null;
  } }) } as unknown as Db;

  assert.equal((await findGuestOrder(db, orderId.toHexString(), 'a'.repeat(43)))?.analyticsPurchaseEligible, true);
  live = false;
  assert.equal((await findGuestOrder(db, orderId.toHexString(), 'a'.repeat(43)))?.analyticsPurchaseEligible, false);
  live = true;
  order.checkoutMode = 'mock';
  assert.equal((await findGuestOrder(db, orderId.toHexString(), 'a'.repeat(43)))?.analyticsPurchaseEligible, false);
});
