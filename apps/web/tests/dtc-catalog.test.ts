import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import {
  adjustInventory, createOffer, duplicateOffer, updateOffer, updateStorefront,
} from '../src/_app/commerce/catalog-mutations.server';
import { collections } from '../src/_app/commerce/collections.server';
import {
  createProductSchema, updateProductSchema, createOfferSchema, storefrontSchema, inventoryAdjustmentSchema,
} from '../src/_app/commerce/contracts';
import { migrateDtcBundles } from '../src/_app/commerce/dtc-bundles-migration.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { calculateOfferItems } from '../src/_app/commerce/offer-calculator.server';
import { createProduct, productDto, updateProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';
import { ApiError } from '../src/shared/lib/api/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const admin = new ObjectId();
const mutation = (version: number) => ({ version, operationId: randomUUID(), reason: 'Synthetic catalog test' });
const code = (value: string) => (error: unknown) => error instanceof ApiError && error.code === value;

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('dtc_catalog_tests') };
  await migrateCommerce(context.db);
  await migrateDtcBundles(context.db);
}, { timeout: 120000 });
after(async () => { await context?.client.close(); await replica?.stop(); });

const fixture = async (sku: string) => {
  await createProduct(context, admin, createProductSchema.parse({ sku, name: 'Synthetic product', shortDescription: '',
    unitAmount: 1999, stockQuantity: 12, salesEnabled: true, operationId: randomUUID() }));
  return sku;
};

const read = async (sku: string) => (await collections(context.db).products.findOne({ sku }))!;

test('offer lifecycle replays IDs, validates transitions and removes home references atomically', async () => {
  const sku = await fixture('CATALOG');
  const input = { ...mutation(1), unitsPerPack: 2, unitAmount: 2999, sortOrder: 10 };
  const created = await createOffer(context, admin, sku, input);
  assert.equal((await createOffer(context, admin, sku, input)).offerId, created.offerId);
  await assert.rejects(createOffer(context, admin, sku, { ...input, unitAmount: 3000 }), code('IDEMPOTENCY_CONFLICT'));
  assert.equal(productDto(await read(sku)).purchaseOffers?.length, 1);
  const offerId = created.offerId!;
  await updateOffer(context, admin, sku, offerId, { ...mutation(2), status: 'active' });
  await assert.rejects(updateOffer(context, admin, sku, offerId, { ...mutation(3), status: 'draft' }), code('OFFER_TRANSITION'));
  await updateStorefront(context, admin, sku, { ...mutation(3), homeOfferIds: ['standard', offerId],
    highlightedOfferId: offerId, highlightBadge: 'recommended' });
  const product = await read(sku);
  const items = calculateOfferItems([product], [{ sku, offerId, quantity: 2, productVersion: 4 }]);
  assert.equal(items[0].inventoryQuantity, 4);
  assert.equal(items[0].lineSubtotal, 5998);
  assert.throws(() => calculateOfferItems([product], [{ sku, offerId, quantity: 6 },
    { sku, offerId: 'standard', quantity: 1 }]), code('OUT_OF_STOCK'));
  await updateOffer(context, admin, sku, offerId, { ...mutation(4), status: 'archived' });
  assert.deepEqual((await read(sku)).storefront?.homeOfferIds, ['standard']);
  assert.equal((await read(sku)).storefront?.highlightedOfferId, null);
  const duplicateInput = mutation(5);
  const duplicate = await duplicateOffer(context, admin, sku, offerId, duplicateInput);
  assert.equal((await duplicateOffer(context, admin, sku, offerId, duplicateInput)).offerId, duplicate.offerId);
  assert.equal((await read(sku)).offers?.find(offer => offer.id === duplicate.offerId)?.status, 'draft');
  assert.equal((await read(sku)).inventory.stockQuantity, 12);
});

test('inventory adjustment is independent, replayable and rejects stale or reserved stock', async () => {
  const sku = await fixture('INVENTORY');

  const input = { mode: 'delta' as const, quantity: 3, expectedInventoryVersion: 1,
    operationId: randomUUID(), reason: 'Synthetic stock correction' };

  await adjustInventory(context, admin, sku, input);
  await adjustInventory(context, admin, sku, input);
  assert.equal((await read(sku)).inventory.stockQuantity, 15);
  assert.equal((await read(sku)).version, 1);
  await assert.rejects(adjustInventory(context, admin, sku, { ...input, operationId: randomUUID() }),
    code('INVENTORY_VERSION_CONFLICT'));
  await assert.rejects(updateProduct(context, admin, sku, updateProductSchema.parse({ ...mutation(1), stockQuantity: 10 })),
    code('INVENTORY_ADJUSTMENT_REQUIRED'));
  await reserveOrder(context, { items: [{ sku, quantity: 2, productVersion: 1 }],
    creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
    guestAccessExpiresAt: new Date(Date.now() + 3600000),
    expiresAt: new Date(Date.now() + 1800000), livemode: false,
    pricingPolicy: { shipping: 'test', tax: 'test', discount: 'none-v1' } });
  assert.equal((await read(sku)).inventory.version, 3);
  await assert.rejects(adjustInventory(context, admin, sku, { ...input, mode: 'set', quantity: 1,
    expectedInventoryVersion: 3, operationId: randomUUID() }), code('STOCK_RESERVED'));

  const outcomes = await Promise.allSettled([0, 1].map(() => adjustInventory(context, admin, sku,
    { ...input, expectedInventoryVersion: 3, operationId: randomUUID() })));

  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await read(sku)).inventory.stockQuantity, 18);
  await updateProduct(context, admin, sku, updateProductSchema.parse({ ...mutation(1), unitAmount: 2199 }));
  assert.equal((await read(sku)).inventory.version, 4);
  assert.equal((await read(sku)).inventory.reservedQuantity, 2);
});

test('new admin routes enforce authentication, same-origin and no-store before database access', async () => {
  const routes = await Promise.all([
    import('../app/api/admin/products/[sku]/offers/route').then(route => route.POST),
    import('../app/api/admin/products/[sku]/offers/[offerId]/route').then(route => route.PATCH),
    import('../app/api/admin/products/[sku]/offers/[offerId]/duplicate/route').then(route => route.POST),
    import('../app/api/admin/products/[sku]/storefront/route').then(route => route.PATCH),
    import('../app/api/admin/products/[sku]/inventory/adjustments/route').then(route => route.POST),
  ]);

  for (const route of routes) {
    const params = { params: Promise.resolve({ sku: 'SYNTHETIC', offerId: randomUUID() }) };

    const denied = await route(new Request('http://localhost/api/admin/products/SYNTHETIC', {
      method: 'POST', headers: { origin: 'https://outside.example.test' },
    }), params);

    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('cache-control'), 'no-store');

    const unauthenticated = await route(new Request('http://localhost/api/admin/products/SYNTHETIC', {
      method: 'POST', headers: { origin: 'http://localhost' },
    }), params);

    assert.equal(unauthenticated.status, 401);
  }
});

test('catalog contracts reject forged IDs, invalid counts, unsafe prices and invalid home selections', () => {
  const offer = { ...mutation(1), unitsPerPack: 2, unitAmount: 2999, sortOrder: 0 };

  for (const patch of [{ unitsPerPack: 0 }, { unitsPerPack: 100 }, { unitAmount: 0 },
    { unitAmount: 100000000 }, { id: randomUUID() }, { status: 'active' }, { sortOrder: 10000 }]) {
    assert.equal(createOfferSchema.safeParse({ ...offer, ...patch }).success, false);
  }

  assert.equal(storefrontSchema.safeParse({ ...mutation(1), homeOfferIds: ['standard', 'standard'],
    highlightedOfferId: null, highlightBadge: 'recommended' }).success, false);
  assert.equal(storefrontSchema.safeParse({ ...mutation(1), homeOfferIds: [],
    highlightedOfferId: 'standard', highlightBadge: 'recommended' }).success, false);
  assert.equal(inventoryAdjustmentSchema.safeParse({ mode: 'set', quantity: -1, expectedInventoryVersion: 1,
    operationId: randomUUID(), reason: 'Invalid stock' }).success, false);
});
