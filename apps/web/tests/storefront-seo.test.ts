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

test('information and About metadata reference an Open Graph image that exists in public', async () => {
  const { existsSync } = await import('node:fs');
  const { defaultOgImage } = await import('../src/shared/config/site');
  const { getInformationMetadata } = await import('../src/_pages/information/model/getInformationMetadata');
  const { informationPages } = await import('../src/_pages/information/model/pages');
  const urls = new Set<string>([defaultOgImage.url]);

  for (const content of Object.values(informationPages)) {
    const images = getInformationMetadata(content).openGraph!.images as { url: string }[];

    for (const image of images) urls.add(image.url);
  }

  for (const url of urls) assert.ok(existsSync(new URL(`../public${url}`, import.meta.url)), `${url} is missing`);
});

test('information pages keep search titles and descriptions within recommended lengths', async () => {
  const { getInformationMetadata } = await import('../src/_pages/information/model/getInformationMetadata');
  const { informationPages } = await import('../src/_pages/information/model/pages');

  // /about is served by its own dictionary-based route; its entry here is unused metadata.
  for (const content of Object.values(informationPages).filter(page => page.path !== '/about')) {
    const { title, description } = getInformationMetadata(content) as { title: string; description: string };

    assert.ok(title.length >= 40 && title.length <= 60, `${content.path} title length ${title.length}`);
    assert.ok(description.length >= 110 && description.length <= 160, `${content.path} description length ${description.length}`);
  }
});
