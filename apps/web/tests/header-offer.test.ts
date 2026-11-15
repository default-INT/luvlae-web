import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getProductAnalytics } from '../src/entities/product/model/analytics';
import { resolveOfferRequest } from '../src/entities/product/model/resolve-offer-request';

import type { ProductOffer } from '../src/entities/product/model/offer';

const offer = {
  sku: 'patches', name: 'Patches', price: { currency: 'USD', unitAmount: 1999 },
  storefront: { homeOfferIds: ['standard', 'pack'], highlightedOfferId: 'pack', highlightBadge: 'bestValue' },
  purchaseOffers: [
    { offerId: 'standard', price: { currency: 'USD', unitAmount: 1999 } },
    { offerId: 'pack', price: { currency: 'USD', unitAmount: 2999 } },
  ],
} as ProductOffer;

test('header alias selects the highlighted pack and analytics uses its stable ID and price', () => {
  assert.equal(resolveOfferRequest(offer, 'best-value'), 'pack');
  const analytics = getProductAnalytics(offer, 1, 'best-value');
  assert.equal(analytics.items[0].item_variant, 'pack');
  assert.equal(analytics.value, 29.99);
  assert.equal(resolveOfferRequest(offer, 'standard'), 'standard');
  assert.equal(resolveOfferRequest(offer, 'invalid-id'), 'invalid-id');
});

test('missing and removed highlights fall back to standard', () => {
  assert.equal(resolveOfferRequest(null, 'best-value'), 'standard');
  assert.equal(resolveOfferRequest({ ...offer, storefront: undefined }, 'best-value'), 'standard');
  assert.equal(resolveOfferRequest({ ...offer, purchaseOffers: offer.purchaseOffers?.slice(0, 1) }, 'best-value'), 'standard');
});
