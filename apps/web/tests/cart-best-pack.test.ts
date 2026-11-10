import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createCartStore } from '../src/features/shopping-cart/model/store';
import { cartKey } from '../src/features/shopping-cart/model/cart';
import { bestPackPlan } from '../src/features/shopping-cart/model/best-pack';

import type { PurchaseOffer } from '../src/entities/product';

const offer = (unitsPerPack: number, unitAmount: number, availableQuantity = 99): PurchaseOffer => ({
  offerId: String(unitsPerPack), unitsPerPack, patchesPerPack: unitsPerPack * 60,
  price: { currency: 'USD', unitAmount }, availableQuantity, sortOrder: 0,
});

test('best pack preserves exact boxes and minimizes total including mixed packs', () => {
  const offers = [offer(1, 1999), offer(2, 2999), offer(3, 4999)];
  assert.equal(bestPackPlan(offers, 2)?.total, 2999);
  assert.equal(bestPackPlan(offers, 3)?.total, 4998);
  const four = bestPackPlan(offers, 4)!;
  assert.equal(four.total, 5998);
  assert.equal(four.selections[0].quantity, 2);
  assert.equal(four.selections[0].offer.unitsPerPack, 2);
});

test('best pack respects stock and never rounds up quantity for a cheaper larger pack', () => {
  const offers = [offer(1, 1999), offer(2, 2999, 1), offer(3, 4999, 0), offer(5, 100)];
  assert.equal(bestPackPlan(offers, 4)?.total, 6997);
  assert.equal(bestPackPlan([offer(2, 100)], 3), null);
  assert.equal(bestPackPlan(offers, 100), null);
});

test('applying a suggestion preserves boxes across existing lines and reduces subtotal atomically', () => {
  const store = createCartStore();
  const packs = [offer(1, 1999), offer(2, 2999)];

  const product = { id: 'test', sku: 'TEST', name: 'Test', shortDescription: '', version: 1,
    price: packs[0].price, availableQuantity: 12, availableBoxes: 12, salesEnabled: true,
    unitsPerPack: 1, offerId: '1', purchaseOffers: packs };

  store.getState().add(product, 2);
  store.getState().add({ ...product, offerId: '2', unitsPerPack: 2, price: packs[1].price, availableQuantity: 6 }, 1);
  assert.equal(store.getState().items.length, 2);
  assert.equal(store.getState().optimizePacks('TEST'), 999);
  const state = store.getState();
  assert.deepEqual(state.items, [{ sku: 'TEST', offerId: '2', quantity: 2 }]);
  assert.equal(state.offers[cartKey(state.items[0])].unitsPerPack! * state.items[0].quantity, 4);
  assert.equal(state.items[0].quantity * state.offers[cartKey(state.items[0])].price.unitAmount, 5998);
  assert.equal(state.optimizePacks('TEST'), 0);
});

test('suggestions do not bypass stock limits or pending checkout ownership', () => {
  const store = createCartStore();
  const packs = [offer(1, 1999), offer(2, 2999)];

  const product = { id: 'test', sku: 'TEST', name: 'Test', shortDescription: '', version: 1,
    price: packs[0].price, availableQuantity: 12, availableBoxes: 12, salesEnabled: true,
    unitsPerPack: 1, offerId: '1', purchaseOffers: packs };

  store.getState().add(product, 4);
  const before = store.getState().items;
  store.setState({ pending: { operationId: 'pending', guestToken: 'test', items: [] } });
  assert.equal(store.getState().optimizePacks('TEST'), 0);
  assert.deepEqual(store.getState().items, before);
  store.setState({ pending: null, offers: { [cartKey(product)]: { ...product, availableBoxes: 3 } } });
  assert.equal(store.getState().optimizePacks('TEST'), 0);
  assert.deepEqual(store.getState().items, before);
});
