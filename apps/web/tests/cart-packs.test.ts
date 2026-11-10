import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCartStore } from '../src/features/shopping-cart/model/store';
import {
  cartKey, parseCart, parseOffers, parsePending, pendingKey, pendingRequest, selectPurchaseOffer, toCartOffer,
} from '../src/features/shopping-cart/model/cart';
import { dictionaryShape } from '../src/shared/config/i18n/dictionary';

import type { ProductOffer } from '../src/entities/product';
import type { ShippingAddress } from '../src/entities/order';
import type { commerceRequest } from '../src/features/shopping-cart/api/commerce';

const sku = 'LUVLAE-BERBERINE-60';
const two = '00000000-0000-4000-8000-000000000002';
const three = '00000000-0000-4000-8000-000000000003';
const orderId = '000000000000000000000099';
const copy = dictionaryShape.commerce;

const address: ShippingAddress = { recipientName: 'Example Recipient', line1: '123 Example St', city: 'Austin',
  state: 'TX', postalCode: '78701', country: 'US' };

const product: ProductOffer = {
  id: '000000000000000000000001', sku, name: 'Patches', shortDescription: '',
  price: { currency: 'USD', unitAmount: 1999 }, salesEnabled: true, version: 4, availableQuantity: 5,
  purchaseOffers: [
    { offerId: 'standard', unitsPerPack: 1, patchesPerPack: 60, price: { currency: 'USD', unitAmount: 1999 },
      availableQuantity: 5, sortOrder: 0 },
    { offerId: two, unitsPerPack: 2, patchesPerPack: 120, price: { currency: 'USD', unitAmount: 2999 },
      availableQuantity: 2, sortOrder: 1 },
    { offerId: three, unitsPerPack: 3, patchesPerPack: 180, price: { currency: 'USD', unitAmount: 3999 },
      availableQuantity: 1, sortOrder: 2 },
  ],
};

const offer = (id: string, stock = product.availableQuantity) => {
  const selected = product.purchaseOffers!.find(value => value.offerId === id)!;
  return toCartOffer({ ...product, availableQuantity: stock }, {
    ...selected, availableQuantity: Math.floor(stock / selected.unitsPerPack),
  });
};

const memory = () => {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
};

test('mixed offers use independent set lines and reject additions atomically when shared boxes do not fit', () => {
  const store = createCartStore();
  assert.equal(store.getState().add(offer(two, 4), 1), true);
  assert.equal(store.getState().add(offer(three, 4), 1), false);
  assert.deepEqual(store.getState().items, [{ sku, offerId: two, quantity: 1 }]);
  assert.equal(store.getState().add(offer(three), 1), true);
  assert.equal(store.getState().items.length, 2);
  assert.equal(store.getState().add(offer(two), 1), false);
  assert.equal(store.getState().items.find(item => item.offerId === two)?.quantity, 1);
  store.getState().update(sku, 2, two);
  assert.equal(store.getState().items.find(item => item.offerId === two)?.quantity, 1);
});

test('v2 cart lines migrate to standard while legacy pending request fields remain byte-for-byte equivalent', () => {
  const oldItems = [{ sku, quantity: 2 }];
  const items = parseCart(oldItems);
  assert.deepEqual(items, [{ sku, offerId: 'standard', quantity: 2 }]);
  assert.equal(parseOffers({ [sku]: product }, items)[cartKey(items[0])].unitsPerPack, 1);

  const pending = { operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43),
    items: [{ sku, quantity: 2, productVersion: 1 }] };

  const parsed = parsePending(JSON.parse(JSON.stringify(pending)));
  assert.ok(parsed);
  assert.equal(JSON.stringify(pendingRequest(parsed)), JSON.stringify(pending));
  assert.equal('offerId' in parsed.items[0], false);
  assert.equal('shippingAddress' in parsed, false);
});

test('packs-v2 quote omits address and lost-response resume preserves exact private session request', async () => {
  const session = memory();
  const persistent = memory();
  const bodies: unknown[] = [];
  let productsRead = 0;
  let lostResponse = true;

  const request: typeof commerceRequest = async <T>(path: string, body?: unknown): Promise<T> => {
    if (path.startsWith('/api/products/')) { productsRead += 1; return product as T; }

    if (path.endsWith('/quote')) {
      assert.deepEqual(body, { cartFormat: 'packs-v2', items: [{ sku, offerId: two, quantity: 1 }] });
      assert.equal(JSON.stringify(body).includes(address.line1), false);
      return { items: [{ sku, offerId: two, quantity: 1, productVersion: 4, unitAmount: 2999 }] } as T;
    }

    bodies.push(body);

    if (lostResponse) { lostResponse = false; throw new Error('Response lost'); }

    return { id: orderId } as T;
  };

  const store = createCartStore({ request, session: () => session, persistent: () => persistent });
  store.getState().add(offer(two), 1);
  assert.equal(await store.getState().checkout(copy), null);
  assert.equal(productsRead, 0);
  assert.equal(await store.getState().checkout(copy, address), null);
  const pending = parsePending(JSON.parse(session.getItem(pendingKey)!));
  assert.ok(pending);
  assert.equal(pending.cartFormat, 'packs-v2');
  assert.equal(pending.shippingAddress?.line1, address.line1);
  store.getState().update(sku, 2, two);
  assert.equal(store.getState().items[0].quantity, 1);
  const restored = createCartStore({ request, session: () => session, persistent: () => persistent });
  restored.getState().restore(store.getState().items, store.getState().offers, pending);
  assert.equal(await restored.getState().checkout(copy, { ...address, line1: 'Different address' }), orderId);
  assert.deepEqual(bodies[1], bodies[0]);
  assert.equal(productsRead, 1);
  assert.equal(persistent.data.size, 0);
});

test('paid cleanup subtracts only matching offer lines and persistent receipt contains no address', () => {
  const session = memory();
  const persistent = memory();
  const store = createCartStore({ session: () => session, persistent: () => persistent });
  const items = [{ sku, offerId: two, quantity: 2 }, { sku, offerId: three, quantity: 1 }];

  const pending = { cartFormat: 'packs-v2' as const, operationId: '00000000-0000-4000-8000-000000000010',
    guestToken: 'a'.repeat(43), orderId, shippingAddress: address,
    items: [{ sku, offerId: two, quantity: 1, productVersion: 4 }] };

  store.getState().restore(items, { [cartKey(items[0])]: offer(two), [cartKey(items[1])]: offer(three) }, pending);
  store.getState().confirmPaidOrder(orderId, pending.items);
  assert.deepEqual(store.getState().items, [{ sku, offerId: two, quantity: 1 }, { sku, offerId: three, quantity: 1 }]);
  assert.equal([...persistent.data.values()].some(value => value.includes(address.line1)), false);
  store.getState().confirmPaidOrder(orderId, pending.items);
  assert.equal(store.getState().items[0].quantity, 1);
});

test('only explicit legacy reload-required rejection forgets an unsent request and permits address entry', async () => {
  const session = memory();

  const pending = { operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43),
    items: [{ sku, quantity: 1, productVersion: 1 }] };

  let code = 'NETWORK_TIMEOUT';
  const request: typeof commerceRequest = async () => { throw new Error(code); };
  const store = createCartStore({ request, session: () => session });
  session.setItem(pendingKey, JSON.stringify(pending));
  store.getState().restore([{ sku, quantity: 1 }], { [sku]: product }, pending);
  assert.equal(await store.getState().checkout(copy), null);
  assert.deepEqual(store.getState().pending, pending);
  code = 'CHECKOUT_RELOAD_REQUIRED';
  assert.equal(await store.getState().checkout(copy), null);
  assert.equal(store.getState().pending, null);
  assert.equal(session.getItem(pendingKey), null);
  assert.equal(store.getState().items[0].quantity, 1);
  assert.equal(store.getState().error, copy.checkoutReloadRequired);
});

test('replacement merges destination sets atomically and enforces shared stock and 99 boxes', () => {
  const store = createCartStore();
  store.getState().add(offer('standard'), 1);
  store.getState().add(offer(two), 1);
  assert.equal(store.getState().replaceOffer(sku, 'standard', offer(two)), true);
  assert.deepEqual(store.getState().items, [{ sku, offerId: two, quantity: 2 }]);
  const before = store.getState().items;
  assert.equal(store.getState().replaceOffer(sku, two, offer(three)), false);
  assert.equal(store.getState().items, before);
  const ample = offer('standard', 1000);
  store.getState().restore([{ sku, offerId: 'standard', quantity: 50 }], { [cartKey(ample)]: ample }, null);
  assert.equal(store.getState().replaceOffer(sku, 'standard', offer(two, 1000)), false);
  assert.equal(store.getState().items[0].quantity, 50);
});

test('replacement stays gated throughout pending cancellation', async () => {
  const session = memory();
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const request: typeof commerceRequest = async <T>(): Promise<T> => { await waiting; return {} as T; };
  const store = createCartStore({ request, session: () => session });

  const pending = { operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43), orderId,
    items: [{ sku, quantity: 1, productVersion: 1 }] };

  store.getState().restore([{ sku, quantity: 1 }], { [sku]: product }, pending);
  assert.equal(store.getState().replaceOffer(sku, 'standard', offer(two)), false);
  const cancelling = store.getState().cancelCheckout(copy);
  assert.equal(store.getState().replaceOffer(sku, 'standard', offer(two)), false);
  release();
  assert.equal(await cancelling, true);
  assert.equal(store.getState().replaceOffer(sku, 'standard', offer(two)), true);
});

for (const failure of ['CHECKOUT_NOT_READY', 'NETWORK_TIMEOUT']) {
  test(`v2 resolution ${failure} keeps exact frozen pending without replay`, async () => {
    const session = memory();

    const pending = { cartFormat: 'packs-v2' as const, shippingAddress: address,
      operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43),
      items: [{ sku, offerId: two, quantity: 1, productVersion: 4 }] };

    const calls: string[] = [];

    const request: typeof commerceRequest = async (path, body) => {
      calls.push(path);
      assert.deepEqual(body, { operationId: pending.operationId, guestToken: pending.guestToken });
      throw new Error(failure);
    };

    const store = createCartStore({ request, session: () => session });
    session.setItem(pendingKey, JSON.stringify(pending));
    store.getState().restore([{ sku, offerId: two, quantity: 1 }], { [cartKey(offer(two))]: offer(two) }, pending);
    assert.equal(await store.getState().cancelCheckout(copy), false);
    assert.equal(store.getState().pending, pending);
    assert.equal(session.getItem(pendingKey), JSON.stringify(pending));
    assert.deepEqual(calls, ['/api/checkout/resolve']);
  });
}

for (const cartFormat of [undefined, 'packs-v1', 'packs-v2'] as const) {
  test(`${cartFormat ?? 'legacy'} unknown provider association replays exact request`, async () => {
    const session = memory();

    const pending = parsePending({ ...(cartFormat ? { cartFormat } : {}),
      ...(cartFormat === 'packs-v2' ? { shippingAddress: address } : {}),
      operationId: '00000000-0000-4000-8000-000000000010', guestToken: 'a'.repeat(43),
      items: [{ sku, ...(cartFormat ? { offerId: two } : {}), quantity: 1, productVersion: 4 }] })!;

    const calls: string[] = [];
    let cancellations = 0;

    const request: typeof commerceRequest = async <T>(path: string, body?: unknown): Promise<T> => {
      calls.push(path);

      if (path === '/api/checkout/session') assert.deepEqual(body, pendingRequest(pending));

      if (path.endsWith('/cancel') && cancellations++ === 0) throw new Error('CHECKOUT_NOT_READY');

      return { id: orderId } as T;
    };

    const store = createCartStore({ request, session: () => session });
    store.getState().restore([{ sku, quantity: 1 }], { [sku]: product }, pending);
    assert.equal(await store.getState().cancelCheckout(copy), true);
    assert.deepEqual(calls, ['/api/checkout/resolve', `/api/orders/${orderId}/checkout/cancel`,
      '/api/checkout/session', `/api/orders/${orderId}/checkout/cancel`]);
    assert.equal(store.getState().pending, null);
  });
}

test('query selection defaults invalid, archived and duplicate offers to standard while sold-out remains selected', () => {
  const offers = product.purchaseOffers!;

  for (const requested of [undefined, 'missing', '', [two, three], '00000000-0000-4000-8000-000000000004']) {
    const result = selectPurchaseOffer(offers, requested);
    assert.equal(result.selected?.offerId, 'standard');
    assert.equal(result.invalid, requested !== undefined);
  }

  const soldOut = offers.map(value => ({ ...value, availableQuantity: 0 }));
  assert.equal(selectPurchaseOffer(soldOut, two).selected?.offerId, two);
  assert.equal(selectPurchaseOffer(soldOut, two).invalid, false);
  assert.equal(selectPurchaseOffer(offers, three).selected?.offerId, three);
  assert.equal(selectPurchaseOffer(offers, two).selected?.offerId, two);
});
