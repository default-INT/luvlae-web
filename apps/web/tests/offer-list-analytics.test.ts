import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { after, beforeEach, test } from 'node:test';

import type { PurchaseOffer , ProductOffer } from '../src/entities/product';
import type { ItemListParameters } from '../src/shared/lib/analytics';

const originalEnv = process.env.NEXT_PUBLIC_APP_ENV;
const originalId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const originals = ['window', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
process.env.NEXT_PUBLIC_APP_ENV = 'production';
process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-LISTTEST01';
const { trackItemListEvent } = await import('../src/shared/lib/analytics');
const { getHomeOfferListAnalytics, getProductAnalytics } = await import('../src/entities/product');

const { observeOfferImpressions } = await import(
  '../src/_pages/home/ui/PurchaseOffers/ui/OfferListAnalytics/utils/observeOfferImpressions'
);

const offers: PurchaseOffer[] = [1, 2, 3].map((unitsPerPack, index) => ({
  offerId: index === 0 ? 'standard' : `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
  unitsPerPack, patchesPerPack: unitsPerPack * 60, price: { currency: 'USD', unitAmount: [1999, 2999, 3999][index] },
  availableQuantity: 10, sortOrder: index * 10,
}));

let queue: unknown[][] = [];

test('PDP view analytics matches initial selected pack and uses standard for invalid or duplicate queries', () => {
  const productOffer = { sku: 'LUVLAE-BERBERINE-60', name: 'Synthetic patches', price: offers[0].price,
    purchaseOffers: offers } as ProductOffer;

  const selected = getProductAnalytics(productOffer, 1, offers[2].offerId);
  assert.equal(selected.value, 39.99);
  assert.equal(selected.items[0].item_variant, offers[2].offerId);

  for (const id of [undefined, '', 'archived-id']) {
    const fallback = getProductAnalytics(productOffer, 1, id);
    assert.equal(fallback.value, 19.99);
    assert.equal(fallback.items[0].item_variant, 'standard');
  }
});
beforeEach(() => {
  queue = [];
  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: new URL('https://www.luvlae.com/?email=private@example.test#token'),
    gtag: (...args: unknown[]) => queue.push(args),
  } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    title: 'Luvlae', referrer: 'https://www.luvlae.com/orders/private-order/checkout?token=private',
  } });
});
after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }

  if (originalEnv === undefined) delete process.env.NEXT_PUBLIC_APP_ENV;
  else process.env.NEXT_PUBLIC_APP_ENV = originalEnv;

  if (originalId === undefined) delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  else process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = originalId;
});

test('home list uses stable offer variants and visible positions, with pack prices and no financial aggregate value', () => {
  const parameters = getHomeOfferListAnalytics([offers[2], offers[0], offers[1]]);
  assert.deepEqual(parameters.items.map(item => [item.index, item.item_variant, item.price, item.quantity]), [
    [0, offers[2].offerId, 39.99, 1], [1, 'standard', 19.99, 1], [2, offers[1].offerId, 29.99, 1],
  ]);
  assert.equal(parameters.item_list_id, 'home_purchase_offers');
  assert.equal('value' in parameters, false);
  assert.equal(parameters.items.every(item => item.item_id === 'LUVLAE-BERBERINE-60'), true);
  assert.equal(trackItemListEvent('view_item_list', parameters), true);
  assert.equal(trackItemListEvent('select_item', { ...parameters, items: [parameters.items[2]] }), true);
  assert.equal(trackItemListEvent('select_item', parameters), false);
  const events = queue.filter(row => row[0] === 'event');
  assert.deepEqual(events.map(row => row[1]), ['view_item_list', 'select_item']);
  const selected = events[1][2] as ItemListParameters;
  assert.equal(selected.items[0].index, 2);
  assert.equal(selected.items[0].item_variant, offers[1].offerId);
  assert.equal('value' in selected, false);
});

test('list adapter allowlist removes extra customer/provider fields and raw location tokens', () => {
  const original = getHomeOfferListAnalytics(offers);
  const privateEmail = 'private@example.test';

  const contaminated = { ...original, value: 9999, customer: 'private@example.test', guestToken: 'private-token',
    items: original.items.map(item => ({ ...item, email: privateEmail, provider: { client_secret: 'private-token' } })) };

  assert.equal(trackItemListEvent('view_item_list', contaminated), true);
  const event = queue.find(row => row[1] === 'view_item_list')![2] as ItemListParameters & Record<string, unknown>;
  assert.deepEqual(Object.keys(event).sort(), ['currency', 'item_list_id', 'item_list_name', 'items',
    'page_location', 'page_referrer', 'page_title']);
  const serialized = JSON.stringify(queue);

  for (const secret of ['private@example.test', 'private-token', 'private-order', '?email=', '?token=']) {
    assert.equal(serialized.includes(secret), false);
  }

  assert.equal(event.page_location, 'https://www.luvlae.com/');
  assert.equal(event.page_referrer, 'https://www.luvlae.com/checkout');
});

test('stage and noncanonical origins do not emit list or selection events', () => {
  const parameters = getHomeOfferListAnalytics(offers);

  for (const environment of ['stage', 'development', '']) {
    process.env.NEXT_PUBLIC_APP_ENV = environment;
    assert.equal(trackItemListEvent('view_item_list', parameters), false);
    assert.equal(trackItemListEvent('select_item', { ...parameters, items: [parameters.items[0]] }), false);
  }

  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: new URL('http://localhost:3022') } });
  assert.equal(trackItemListEvent('view_item_list', parameters), false);
  assert.equal(queue.length, 0);
});

test('missing GA configuration emits nothing, even at the canonical production origin', () => {
  const script = `globalThis.window = {location: new URL('https://www.luvlae.com/'), gtag(){throw Error('unexpected event');}};
    const {trackItemListEvent} = await import('./src/shared/lib/analytics/analytics.ts');
    const sent = trackItemListEvent('view_item_list', {item_list_id:'home_purchase_offers',item_list_name:'Home',currency:'USD',
      items:[{item_id:'SKU',item_name:'Product',price:19.99,quantity:1,index:0}]});
    if (sent) process.exit(1);`;

  const args = ['--conditions=react-server', '--import', 'tsx', '--input-type=module', '-e', script];

  const result = spawnSync(process.execPath, args, {
    env: { ...process.env, NEXT_PUBLIC_APP_ENV: 'production', NEXT_PUBLIC_GA_MEASUREMENT_ID: '' }, encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
});

test('observer emits only half-visible cards once per mount and retains dedupe across effect recreation', () => {
  const parameters = getHomeOfferListAnalytics(offers);
  const cards = offers.map(offer => ({ getAttribute: (name: string) => name === 'data-offer-id' ? offer.offerId : null }));
  const root = { querySelectorAll: () => cards } as unknown as HTMLElement;
  let callback: IntersectionObserverCallback;
  let disconnected = false;
  const observed: unknown[] = [];
  const unobserved: unknown[] = [];
  class Observer {
    activity = { observed, unobserved, disconnect: () => { disconnected = true; } };
    constructor(next: IntersectionObserverCallback, options: IntersectionObserverInit) {
      callback = next;
      assert.equal(options.threshold, 0.5);
    }
    observe = (target: unknown) => { this.activity.observed.push(target); };
    unobserve = (target: unknown) => { this.activity.unobserved.push(target); };
    disconnect = () => { this.activity.disconnect(); };
  }
  const seen = new Set<string>();
  const stop = observeOfferImpressions(root, parameters, seen, Observer as unknown as typeof IntersectionObserver);
  assert.equal(observed.length, 3);

  const emit = (ratios: number[]) => callback(ratios.map((intersectionRatio, index) => ({
    intersectionRatio, isIntersecting: intersectionRatio > 0, target: cards[index],
  })) as unknown as IntersectionObserverEntry[], {} as IntersectionObserver);

  process.env.NEXT_PUBLIC_APP_ENV = 'stage';
  emit([1, 1, 1]);
  assert.equal(seen.size, 0);
  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  emit([0, 0.49, 0]);
  assert.equal(queue.filter(row => row[0] === 'event').length, 0);
  emit([0.5, 0, 1]);
  emit([1, 0, 1]);
  emit([1, 0.75, 1]);
  const events = queue.filter(row => row[0] === 'event');
  assert.equal(events.length, 2);
  assert.deepEqual((events[0][2] as ItemListParameters).items.map(item => item.index), [0, 2]);
  assert.deepEqual((events[1][2] as ItemListParameters).items.map(item => item.index), [1]);
  assert.equal(seen.size, 3);
  assert.equal(unobserved.length >= 3, true);
  stop();
  assert.equal(disconnected, true);
  const stopAgain = observeOfferImpressions(root, parameters, seen, Observer as unknown as typeof IntersectionObserver);
  emit([1, 1, 1]);
  assert.equal(queue.filter(row => row[0] === 'event').length, 2);
  stopAgain();
});
