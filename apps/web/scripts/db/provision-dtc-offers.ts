import { ObjectId } from 'mongodb';

import { collections } from '../../src/_app/commerce/collections.server';
import { dtcBundlesMigrationName } from '../../src/_app/commerce/dtc-bundles-migration.server';
import { createDatabaseClient } from '../../src/shared/lib/mongodb/index.server';

import { inspectDtcProvisioning, provisionDtcOffers } from './provision-dtc-offers-core';

const sku = 'LUVLAE-BERBERINE-60';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const adminIndex = args.indexOf('--admin-id');
const adminIdText = adminIndex >= 0 ? args[adminIndex + 1] : undefined;
const fail = (message: string): never => { throw new Error(message); };

const run = async () => {
  if (args.some(arg => arg !== '--apply' && arg !== '--admin-id' && arg !== adminIdText)) {
    fail('Use [--apply] [--admin-id <active admin ObjectId>].');
  }

  if (!process.env.NEXT_MONGODB_URI || !process.env.NEXT_MONGODB_USERNAME || !process.env.NEXT_MONGODB_PASSWORD ||
    !process.env.NEXT_MONGODB_DB_NAME) {
    fail('Provide MongoDB URI, username, password and database name in the process environment. No env files are loaded.');
  }

  if (apply && (!adminIdText || !/^[a-f0-9]{24}$/i.test(adminIdText))) {
    fail('Apply requires --admin-id with an active administrator ObjectId.');
  }

  if (apply && process.env.DB_CONFIRM_NAME !== process.env.NEXT_MONGODB_DB_NAME) {
    fail('Apply requires DB_CONFIRM_NAME to exactly match NEXT_MONGODB_DB_NAME.');
  }

  const context = createDatabaseClient();

  try {
    await context.client.connect();

    const migrationNames = (await context.db.collection('_migrations').find({}).project<{ name: string }>({ name: 1 }).toArray())
      .map(row => row.name);

    for (const required of ['001-commerce', dtcBundlesMigrationName, '009-locked-shipping']) {
      if (!migrationNames.includes(required)) {
        fail(`Required schema migration missing: ${required}. Apply schema migrations separately first.`);
      }
    }

    const inspection = await inspectDtcProvisioning(context);
    const { product } = inspection;
    const adminId = apply ? new ObjectId(adminIdText) : undefined;

    if (adminId && !await collections(context.db).users.findOne({ _id: adminId, status: 'active' })) {
      fail('The supplied administrator is not active.');
    }

    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', database: process.env.NEXT_MONGODB_DB_NAME,
      sku, steps: inspection.steps, drift: inspection.drift, stockQuantity: product.inventory.stockQuantity,
      reservedQuantity: product.inventory.reservedQuantity }, null, 2));

    if (!apply) return;

    if (inspection.drift.length) fail('Provisioning drift found; no writes made. Review the report manually.');

    const result = await provisionDtcOffers(context, adminId!);
    console.log(JSON.stringify({ result, inventoryWritten: false, externalProviderCalls: false }, null, 2));
  } finally {
    await context.client.close();
  }
};

run().catch(error => {
  console.error(error instanceof Error ? error.message : 'Provisioning failed.');
  process.exitCode = 1;
});
