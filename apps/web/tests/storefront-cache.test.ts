import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Writes that change price, packs, storefront copy or available stock shown on cached pages.
const purgingRoutes = [
  'app/api/admin/products/route.ts',
  'app/api/admin/products/[sku]/route.ts',
  'app/api/admin/products/[sku]/offers/route.ts',
  'app/api/admin/products/[sku]/offers/[offerId]/route.ts',
  'app/api/admin/products/[sku]/offers/[offerId]/duplicate/route.ts',
  'app/api/admin/products/[sku]/offers/reorder/route.ts',
  'app/api/admin/products/[sku]/storefront/route.ts',
  'app/api/admin/products/[sku]/inventory/adjustments/route.ts',
  'app/api/admin/orders/[id]/cancel/route.ts',
  'app/api/admin/orders/[id]/restock/route.ts',
  'app/api/admin/orders/[id]/refund/route.ts',
  'app/api/checkout/session/route.ts',
  'app/api/checkout/resolve/route.ts',
  'app/api/checkout/mock/route.ts',
  'app/api/orders/[id]/checkout/cancel/route.ts',
  'app/api/webhooks/stripe/route.ts',
];

test('offer pages are edge ISR, not request-time dynamic', async () => {
  for (const path of ['app/(default)/page.tsx', 'app/(default)/products/berberine-patches/page.tsx']) {
    const source = await read(path);

    assert.match(source, /export const revalidate = \d+;/, path);
    assert.doesNotMatch(source, /force-dynamic|searchParams/, path);
  }
});

test('catalog and stock writes purge cached storefront HTML', async () => {
  for (const path of purgingRoutes) {
    assert.match(await read(path), /withStorefrontRevalidation\(/, path);
  }
});
