import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { collections } from './collections.server';

import type { Document, Db } from 'mongodb';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const migrateMockOrders = async (db: Db) => {
  const name = '002-mock-order-mode';
  if (await db.collection('_migrations').findOne({ name })) return;
  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });
  try {
    const info = await db.listCollections({ name: 'orders' }, { nameOnly: false }).next();
    const validator = info?.options?.validator as Document | undefined;
    if (!validator?.$jsonSchema?.properties) fail(503, 'DATABASE_NOT_READY', 'Run the commerce schema migration first.');
    const schema = validator!.$jsonSchema;
    await db.command({
      collMod: 'orders',
      validator: { ...validator, $jsonSchema: {
        ...schema, properties: { ...schema.properties, checkoutMode: { enum: ['mock', 'stripe'] } },
      } },
      validationLevel: 'strict', validationAction: 'error',
    });
    await db.collection('_migrations').insertOne({ name, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};

// Explicit test-data migration. Existing product edits and stock are never overwritten.
export const seedTestProduct = async (context: DatabaseContext) => inTransaction(context, async session => {
  const name = '003-test-berberine-product';
  if (await context.db.collection('_migrations').findOne({ name }, { session })) return;
  const now = new Date();
  await collections(context.db).products.updateOne({ sku: 'LUVLAE-BERBERINE-60' }, { $setOnInsert: {
    _id: new ObjectId(), schemaVersion: 1, sku: 'LUVLAE-BERBERINE-60',
    name: 'Luvlae Berberine Patches', shortDescription: '60 patches per box.',
    price: { currency: 'USD', unitAmount: 2999 },
    inventory: { stockQuantity: 100, reservedQuantity: 0 }, salesEnabled: true, version: 1,
    createdAt: now, updatedAt: now, updatedBy: new ObjectId('000000000000000000000000'),
  } }, { upsert: true, session });
  await context.db.collection('_migrations').insertOne({ name, appliedAt: now }, { session });
});
