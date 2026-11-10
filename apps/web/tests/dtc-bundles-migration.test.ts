import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { collections } from '../src/_app/commerce/collections.server';
import { createProductSchema } from '../src/_app/commerce/contracts';
import { dtcBundlesMigrationName, migrateDtcBundles } from '../src/_app/commerce/dtc-bundles-migration.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { normalizePackSnapshot } from '../src/entities/product/model/pack-snapshot';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const adminId = new ObjectId();

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('dtc_bundles_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();
});

test('pack snapshot normalizer keeps legacy fields intact and rejects partial or inconsistent snapshots', () => {
  const legacy = { quantity: 2, unitAmount: 1999, lineSubtotal: 3998 };
  assert.deepEqual(normalizePackSnapshot(legacy), { offerId: 'standard', unitsPerPack: 1, inventoryQuantity: 2 });
  assert.deepEqual(normalizePackSnapshot({ ...legacy, offerId: 'standard', unitsPerPack: 1, inventoryQuantity: 2 }), {
    offerId: 'standard', unitsPerPack: 1, inventoryQuantity: 2,
  });
  assert.equal(normalizePackSnapshot({ ...legacy, offerId: randomUUID() }), null);
  assert.equal(normalizePackSnapshot({ ...legacy, offerId: 'standard', unitsPerPack: 2, inventoryQuantity: 4 }), null);
  assert.equal(normalizePackSnapshot({ ...legacy, offerId: randomUUID(), unitsPerPack: 2, inventoryQuantity: 2 }), null);
});

test('008 backfills only missing product fields, preserves legacy orders and rejects malformed new snapshots', async () => {
  const sku = `MIGRATE-${randomUUID().slice(0, 8).toUpperCase()}`;

  const input = createProductSchema.parse({ sku, name: 'Legacy fixture', shortDescription: '', unitAmount: 2500,
    stockQuantity: 4, salesEnabled: true, operationId: randomUUID() });

  const created = await createProduct(context, adminId, input);
  const token = randomToken();

  const reservation = await reserveOrder(context, {
    creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(token),
    guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000),
    livemode: false, pricingPolicy: { shipping: 'legacy', tax: 'legacy', discount: 'none-v1' },
    items: [{ sku, quantity: 1, productVersion: 1 }],
  });

  const { products, orders, attempts } = collections(context.db);
  await products.updateOne({ sku }, { $unset: { offers: '', 'inventory.version': '' } });
  const productBefore = await products.findOne({ sku });
  const orderBefore = await orders.findOne({ _id: reservation.orderId });
  const attemptBefore = await attempts.findOne({ _id: reservation.attemptId });
  assert.ok(productBefore && orderBefore && attemptBefore);
  assert.equal(productBefore.offers, undefined);
  assert.equal(productBefore.inventory.version, undefined);
  assert.equal(orderBefore.items[0].offerId, undefined);

  await context.db.collection('_migrations').deleteOne({ name: dtcBundlesMigrationName });
  await products.updateOne({ _id: productBefore._id }, { $unset: { offers: '', 'inventory.version': '' } });
  await migrateDtcBundles(context.db);

  const productAfter = await products.findOne({ _id: productBefore._id });
  assert.deepEqual(productAfter?.offers, []);
  assert.equal(productAfter?.inventory.version, 1);
  assert.equal(productAfter?.inventory.stockQuantity, productBefore.inventory.stockQuantity);
  assert.equal(productAfter?.inventory.reservedQuantity, productBefore.inventory.reservedQuantity);
  assert.deepEqual(await orders.findOne({ _id: orderBefore._id }), orderBefore);
  assert.deepEqual(await attempts.findOne({ _id: attemptBefore._id }), attemptBefore);

  await migrateDtcBundles(context.db);
  assert.equal(await context.db.collection('_migrations').countDocuments({ name: dtcBundlesMigrationName }), 1);
  const offerId = randomUUID();
  await assert.rejects(orders.updateOne({ _id: orderBefore._id }, { $set: { 'items.0.offerId': offerId } }));
  await assert.rejects(orders.updateOne({ _id: orderBefore._id }, { $set: {
    'items.0.offerId': 'standard', 'items.0.unitsPerPack': 2, 'items.0.inventoryQuantity': 2,
  } }));
  await orders.updateOne({ _id: orderBefore._id }, { $set: {
    'items.0.offerId': 'standard', 'items.0.unitsPerPack': 1, 'items.0.inventoryQuantity': 1,
    'pricingPolicy.catalog': 'packs-v1',
  } });
  assert.equal((await orders.findOne({ _id: orderBefore._id }))?.items[0].inventoryQuantity, 1);
  await attempts.updateOne({ _id: attemptBefore._id }, { $set: { 'quoteSnapshot.pricingPolicy.catalog': 'packs-v1' } });
  assert.equal((await attempts.findOne({ _id: attemptBefore._id }))?.quoteSnapshot.pricingPolicy.catalog, 'packs-v1');
  assert.equal(created.replayed, false);
});
