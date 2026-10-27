import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getOfferSchema, product } from '../src/entities/product';
import { siteOrigin } from '../src/shared/config/site';
import robots from '../app/robots';
import config from '../next.config';

import type { ProductOffer } from '../src/entities/product';

const offer: ProductOffer = {
  id: '000000000000000000000001', sku: product.sku, name: product.name, shortDescription: '',
  price: { currency: 'USD', unitAmount: 1999 }, availableQuantity: 20, salesEnabled: true, version: 1,
};

test('Offer follows the supplied catalog snapshot, including new prices and exhausted inventory', () => {
  const initial = getOfferSchema(offer, product.path)!;
  assert.equal(initial.price, '19.99');
  assert.equal(initial.priceCurrency, 'USD');
  assert.equal(initial.availability, 'https://schema.org/InStock');
  assert.equal(initial.url, `${siteOrigin}${product.path}`);
  assert.equal(initial.seller['@id'], `${siteOrigin}/#organization`);
  const changed = getOfferSchema({ ...offer, price: { currency: 'USD', unitAmount: 2495 }, availableQuantity: 0 }, product.path)!;
  assert.equal(changed.price, '24.95');
  assert.equal(changed.availability, 'https://schema.org/OutOfStock');
});

test('an unavailable, disabled or invalid offer never advertises a fallback price', () => {
  assert.equal(getOfferSchema(null, product.path), undefined);
  assert.equal(getOfferSchema({ ...offer, salesEnabled: false }, product.path), undefined);
  assert.equal(getOfferSchema({ ...offer, price: { currency: 'USD', unitAmount: -1 } }, product.path), undefined);
});

test('discovery URLs use the final host and the host redirect is permanent', async () => {
  assert.equal(robots().sitemap, `${siteOrigin}/sitemap.xml`);
  const redirect = (await config.redirects!())[0];
  assert.equal(redirect.permanent, true);
  assert.equal(redirect.source, '/:path*');
  assert.equal(redirect.destination, `${siteOrigin}/:path*`);
  assert.deepEqual(redirect.has, [{ type: 'host', value: 'luvlae.com' }]);
});
