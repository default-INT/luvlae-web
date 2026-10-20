import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCartStore } from '../src/features/shopping-cart/model/store';
import {
  parseCart, parseOffers, parsePending, parseSettledOrders, pendingKey, storageKey,
} from '../src/features/shopping-cart/model/cart';
import { dictionaryShape } from '../src/shared/config/i18n/dictionary';

import type { ProductOffer } from '../src/entities/product';
import type { commerceRequest } from '../src/features/shopping-cart/api/commerce';

const copy = dictionaryShape.commerce;

const offer: ProductOffer = {
  id: '000000000000000000000001', sku: 'LUVLAE-BERBERINE-60', name: 'Luvlae Berberine Patches',
  shortDescription: '', price: { currency: 'USD', unitAmount: 2999 }, availableQuantity: 100,
  version: 1, salesEnabled: true,
};

const memorySession = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
};

const quote = (price = 2999, version = 1) => ({ items: [{
  sku: offer.sku, quantity: 1, unitAmount: price, productVersion: version,
}] });

test('cart editing and opening make no product requests; stores remain isolated and cap quantity at 99', () => {
  let requests = 0;
  const request: typeof commerceRequest = async () => { requests++; throw new Error('Unexpected network request'); };
  const first = createCartStore({ request });
  const second = createCartStore({ request });
  first.getState().restore([], {}, null);
  first.getState().add(offer, 1);
  first.getState().setOpen(false);
  first.getState().setOpen(true);
  first.getState().update(offer.sku, 99);
  first.getState().update(offer.sku, 100);
  first.getState().update(offer.sku, 0);
  first.getState().add(offer, 1);
  assert.equal(first.getState().items[0].quantity, 99);
  assert.deepEqual(second.getState().items, []);
  first.getState().remove(offer.sku);
  assert.deepEqual(first.getState().items, []);
  assert.equal(requests, 0);
});

test('checkout updates a changed offer and requires confirmation before order creation', async () => {
  const calls: string[] = [];
  const updated = { ...offer, version: 2, price: { currency: 'USD' as const, unitAmount: 3199 } };

  const request: typeof commerceRequest = async <T>(path: string): Promise<T> => {
    calls.push(path);

    if (path.startsWith('/api/products/')) return updated as T;

    if (path.endsWith('/quote')) return quote(3199, 2) as T;

    return { id: '000000000000000000000002' } as T;
  };

  const session = memorySession();
  const store = createCartStore({ request, session: () => session });
  store.getState().add(offer, 1);
  assert.equal(await store.getState().checkout(copy), null);
  assert.equal(store.getState().offers[offer.sku].price.unitAmount, 3199);
  assert.equal(store.getState().error, copy.changedError);
  assert.equal(calls.some(path => path.endsWith('/session')), false);
  assert.equal(await store.getState().checkout(copy), '000000000000000000000002');
  assert.deepEqual(store.getState().items, [{ sku: offer.sku, quantity: 1 }]);
  assert.equal(store.getState().pending?.orderId, '000000000000000000000002');
});

test('checkout rejects insufficient stock without creating an order or blocking subsequent edits', async () => {
  const calls: string[] = [];

  const request: typeof commerceRequest = async <T>(path: string): Promise<T> => {
    calls.push(path);
    return { ...offer, availableQuantity: 1 } as T;
  };

  const session = memorySession();
  const store = createCartStore({ request, session: () => session });
  store.getState().add(offer, 2);
  assert.equal(await store.getState().checkout(copy), null);
  assert.equal(calls.length, 1);
  assert.equal(store.getState().busy, false);
  assert.equal(store.getState().error, copy.changedError);
  store.getState().update(offer.sku, 1);
  assert.equal(store.getState().items[0].quantity, 1);
});

test('uncertain checkout survives reload and retries the exact request without rechecking consumed stock', async () => {
  const session = memorySession();
  const bodies: unknown[] = [];
  const calls: string[] = [];

  const request: typeof commerceRequest = async <T>(path: string, body?: unknown): Promise<T> => {
    calls.push(path);

    if (path.startsWith('/api/products/')) return offer as T;

    if (path.endsWith('/quote')) return quote() as T;

    bodies.push(body);

    if (bodies.length === 1) throw new Error('NETWORK_TIMEOUT');

    return { id: '000000000000000000000003' } as T;
  };

  const store = createCartStore({ request, session: () => session });
  store.getState().add(offer, 1);
  assert.equal(await store.getState().checkout(copy), null);
  const uncertain = store.getState();
  assert.ok(uncertain.pending);
  uncertain.update(offer.sku, 2);
  assert.equal(store.getState().items[0].quantity, 1);
  const restored = createCartStore({ request, session: () => session });
  restored.getState().restore(uncertain.items, uncertain.offers, uncertain.pending);
  assert.equal(await restored.getState().checkout(copy), '000000000000000000000003');
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(calls.filter(path => path.startsWith('/api/products/')).length, 1);
  assert.deepEqual(restored.getState().items, [{ sku: offer.sku, quantity: 1 }]);
  assert.equal(restored.getState().pending?.orderId, '000000000000000000000003');
});

test('double checkout while verification is pending starts only one creation flow', async () => {
  let release: (value: ProductOffer) => void = () => {};
  const verifying = new Promise<ProductOffer>(resolve => { release = resolve; });
  let creations = 0;

  const request: typeof commerceRequest = async <T>(path: string): Promise<T> => {
    if (path.startsWith('/api/products/')) return await verifying as T;

    if (path.endsWith('/quote')) return quote() as T;

    creations++;
    return { id: '000000000000000000000004' } as T;
  };

  const session = memorySession();
  const store = createCartStore({ request, session: () => session });
  store.getState().add(offer, 1);
  const first = store.getState().checkout(copy);
  assert.equal(await store.getState().checkout(copy), null);
  release(offer);
  assert.equal(await first, '000000000000000000000004');
  assert.equal(creations, 1);
});

test('restoring browser storage rejects malformed quantities, duplicate products and invalid price snapshots', () => {
  const items = parseCart([{ sku: offer.sku, quantity: 1 }, { sku: offer.sku, quantity: 2 },
    { sku: 'OTHER', quantity: 100 }, { sku: 'THIRD', quantity: 1.5 }]);

  assert.deepEqual(items, [{ sku: offer.sku, quantity: 1 }]);
  assert.deepEqual(parseOffers({ [offer.sku]: { ...offer, price: { currency: 'USD', unitAmount: -1 } } }, items), {});
  assert.equal(parsePending({ operationId: 'invalid', guestToken: 'invalid', items }), null);
});

const orderId = '000000000000000000000010';

const pendingCheckout = () => ({
  operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43), orderId,
  items: [{ sku: offer.sku, quantity: 1, productVersion: 1 }],
});

test('a completed Session response preserves the cart and resumes using only the original request fields', async () => {
  const session = memorySession();
  const bodies: unknown[] = [];

  const request: typeof commerceRequest = async <T>(path: string, body?: unknown): Promise<T> => {
    assert.equal(path, '/api/checkout/session');
    bodies.push(body);
    return { id: orderId, replayed: true } as T;
  };

  const store = createCartStore({ request, session: () => session });
  const pending = pendingCheckout();
  const items = [{ sku: offer.sku, quantity: 1 }];
  store.getState().restore(items, { [offer.sku]: offer }, pending);
  assert.equal(await store.getState().checkout(copy), orderId);
  assert.deepEqual(store.getState().items, items);
  assert.deepEqual(bodies, [{ operationId: pending.operationId, guestToken: pending.guestToken, items: pending.items }]);
  assert.equal(JSON.parse(session.getItem(pendingKey)!).orderId, orderId);
});

test('only the associated paid order removes its purchased quantities and records a receipt atomically', () => {
  const session = memorySession();
  const persistent = memorySession();
  const store = createCartStore({ session: () => session, persistent: () => persistent });
  const pending = pendingCheckout();
  const items = [{ sku: offer.sku, quantity: 3 }, { sku: 'OTHER', quantity: 2 }];
  store.getState().restore(items, { [offer.sku]: offer }, pending);
  store.getState().confirmPaidOrder('000000000000000000000099', pending.items);
  assert.deepEqual(store.getState().items, items);
  store.getState().confirmPaidOrder(orderId, pending.items);
  assert.deepEqual(store.getState().items, [{ sku: offer.sku, quantity: 2 }, { sku: 'OTHER', quantity: 2 }]);
  assert.equal(store.getState().pending, null);
  const saved = JSON.parse(persistent.getItem(storageKey)!);
  assert.deepEqual(saved.items, store.getState().items);
  assert.deepEqual(saved.settledOrders, [orderId]);
  store.getState().confirmPaidOrder(orderId, pending.items);
  assert.deepEqual(store.getState().items, saved.items);
});

test('paid cleanup survives reload when forgetting the pending browser request failed', () => {
  const persistent = memorySession();
  const session = memorySession();
  const pending = pendingCheckout();
  session.setItem(pendingKey, JSON.stringify(pending));
  const faultySession = { ...session, removeItem: () => { throw new Error('Storage blocked'); } };
  const store = createCartStore({ session: () => faultySession, persistent: () => persistent });
  store.getState().restore([{ sku: offer.sku, quantity: 3 }], { [offer.sku]: offer }, pending);
  store.getState().confirmPaidOrder(orderId, pending.items);
  const saved = JSON.parse(persistent.getItem(storageKey)!);
  const restored = createCartStore({ session: () => session, persistent: () => persistent });
  restored.getState().restore(parseCart(saved.items), parseOffers(saved.offers, saved.items),
    parsePending(JSON.parse(session.getItem(pendingKey)!)), parseSettledOrders(saved.settledOrders));
  restored.getState().confirmPaidOrder(orderId, pending.items);
  assert.deepEqual(restored.getState().items, [{ sku: offer.sku, quantity: 2 }]);
  assert.equal(restored.getState().pending, null);
});

test('blocked cart persistence retains recovery data and does not subtract twice during the same visit', () => {
  const session = memorySession();
  const pending = pendingCheckout();
  session.setItem(pendingKey, JSON.stringify(pending));

  const store = createCartStore({ session: () => session, persistent: () => ({
    setItem: () => { throw new Error('Storage blocked'); },
  }) });

  store.getState().restore([{ sku: offer.sku, quantity: 3 }], { [offer.sku]: offer }, pending);
  store.getState().confirmPaidOrder(orderId, pending.items);
  store.getState().confirmPaidOrder(orderId, pending.items);
  assert.deepEqual(store.getState().items, [{ sku: offer.sku, quantity: 2 }]);
  assert.ok(session.getItem(pendingKey));
});

test('only a matching confirmed expired checkout unlocks the cart without removing items', () => {
  const session = memorySession();
  const pending = pendingCheckout();
  session.setItem(pendingKey, JSON.stringify(pending));
  const store = createCartStore({ session: () => session });
  const items = [{ sku: offer.sku, quantity: 1 }];
  store.getState().restore(items, { [offer.sku]: offer }, pending);
  store.getState().releaseExpiredCheckout('000000000000000000000099');
  assert.ok(store.getState().pending);
  store.getState().releaseExpiredCheckout(orderId);
  assert.equal(store.getState().pending, null);
  assert.deepEqual(store.getState().items, items);
  store.getState().update(offer.sku, 2);
  assert.equal(store.getState().items[0].quantity, 2);
});
