import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { collections } from '../src/_app/commerce/collections.server';
import { createOffer, updateOffer } from '../src/_app/commerce/catalog-mutations.server';
import { createProductSchema } from '../src/_app/commerce/contracts';
import { migrateDtcBundles } from '../src/_app/commerce/dtc-bundles-migration.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createProduct, updateProduct } from '../src/_app/commerce/products.server';
import { inspectDtcProvisioning, provisionDtcOffers, provisionOperationIds } from '../scripts/db/provision-dtc-offers-core';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const admin = new ObjectId();
const sku = 'LUVLAE-BERBERINE-60';

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('dtc_provisioning_tests') };
  await migrateCommerce(context.db);
  await migrateDtcBundles(context.db);
}, { timeout: 120000 });

after(async () => { await context?.client.close(); await replica?.stop(); });

const fixture = async () => {
  await collections(context.db).products.deleteMany({ sku });
  await collections(context.db).audit.deleteMany({ operationId: { $in: Object.values(provisionOperationIds) } });
  await createProduct(context, admin, createProductSchema.parse({ sku, name: 'Synthetic product', shortDescription: '',
    unitAmount: 1999, stockQuantity: 17, salesEnabled: true, operationId: randomUUID() }));
};

const read = async () => (await collections(context.db).products.findOne({ sku }))!;

test('initial provision and rerun replay once, and only catalog fields change', async () => {
  await fixture();
  const before = await read();
  const first = await provisionDtcOffers(context, admin);
  const afterFirst = await read();
  const second = await provisionDtcOffers(context, admin);
  const afterSecond = await read();

  assert.equal(first.offerCount, 2);
  assert.equal(second.offerCount, 2);
  assert.equal(afterFirst.offers?.length, 2);
  assert.equal(afterSecond.offers?.length, 2);
  assert.deepEqual(afterSecond.storefront?.homeOfferIds, ['standard', ...afterSecond.offers!.map(item => item.id)]);
  assert.equal(afterSecond.storefront?.highlightBadge, 'bestValue');
  assert.equal(afterSecond.price.unitAmount, 1999);
  assert.deepEqual(afterSecond.inventory, before.inventory);
  assert.equal(await context.db.collection('orders').countDocuments(), 0);
  assert.equal(await context.db.collection('checkoutAttempts').countDocuments(), 0);
});

test('partial run resumes from audited step; completed catalog edits are not overwritten', async () => {
  await fixture();
  const current = await read();
  await updateProduct(context, admin, sku, { version: current.version, unitAmount: 1999,
    operationId: provisionOperationIds.basePrice, reason: 'Synthetic partial-run setup.' });
  const provisioned = await provisionDtcOffers(context, admin);
  assert.equal(provisioned.offerCount, 2);

  const after = await read();
  await updateProduct(context, admin, sku, { version: after.version, unitAmount: 2199,
    operationId: randomUUID(), reason: 'Synthetic later admin edit.' });
  assert.ok((await inspectDtcProvisioning(context)).drift.some(item => item.includes('base price changed')));
  await assert.rejects(provisionDtcOffers(context, admin), /base price changed/i);
  assert.equal((await read()).price.unitAmount, 2199);
});

test('partial run detects completed-step drift before creating any offer', async () => {
  await fixture();
  const current = await read();
  await updateProduct(context, admin, sku, { version: current.version, unitAmount: 1999,
    operationId: provisionOperationIds.basePrice, reason: 'Synthetic partial-run setup.' });
  const afterStep = await read();
  await updateProduct(context, admin, sku, { version: afterStep.version, unitAmount: 2199,
    operationId: randomUUID(), reason: 'Synthetic later admin edit.' });

  await assert.rejects(provisionDtcOffers(context, admin), /base price changed/i);
  assert.equal((await read()).offers?.length, 0);
  assert.equal((await read()).price.unitAmount, 2199);
});

test('admin edits to an audited draft offer stop before publishing or changing its price', async () => {
  await fixture();
  const current = await read();

  const created = await createOffer(context, admin, sku, { version: current.version,
    operationId: provisionOperationIds.createTwo, reason: 'Synthetic partial offer setup.',
    unitsPerPack: 2, unitAmount: 2999, sortOrder: 1 });

  const afterCreate = await read();
  await updateOffer(context, admin, sku, created.offerId!, { version: afterCreate.version,
    operationId: randomUUID(), reason: 'Synthetic later admin edit.', unitAmount: 3099 });

  assert.ok((await inspectDtcProvisioning(context)).drift.some(item => item.includes('2-Pack differs')));
  await assert.rejects(provisionDtcOffers(context, admin), /2-Pack differs/);
  const result = await read();
  const offer = result.offers?.find(value => value.id === created.offerId);
  assert.equal(offer?.status, 'draft');
  assert.equal(offer?.price.unitAmount, 3099);
  assert.equal(result.inventory.stockQuantity, 17);
});

test('matching untracked offers stop provisioning instead of duplicating or adopting them', async () => {
  await fixture();
  const current = await read();
  await createOffer(context, admin, sku, { version: current.version, operationId: randomUUID(),
    reason: 'Synthetic untracked offer.', unitsPerPack: 2, unitAmount: 2999, sortOrder: 1 });
  await assert.rejects(provisionDtcOffers(context, admin), /matching untracked offer/i);
  assert.equal((await read()).offers?.filter(offer => offer.unitsPerPack === 2 && offer.price.unitAmount === 2999).length, 1);
});
