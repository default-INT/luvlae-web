import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { Db, Document } from 'mongodb';

export const stripeRequestMigrationName = '004-stripe-request-snapshot';

export const migrateStripeRequests = async (db: Db) => {
  if (await db.collection('_migrations').findOne({ name: stripeRequestMigrationName })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    const info = await db.listCollections({ name: 'checkoutAttempts' }, { nameOnly: false }).next();
    const validator = info?.options?.validator as Document | undefined;

    if (!validator?.$jsonSchema?.properties) fail(503, 'DATABASE_NOT_READY', 'Run the commerce schema migration first.');

    const schema = validator!.$jsonSchema;

    await db.command({
      collMod: 'checkoutAttempts',
      validator: { ...validator, $jsonSchema: {
        ...schema,
        properties: { ...schema.properties, stripeRequest: {
          bsonType: 'object', additionalProperties: false, required: ['apiVersion', 'parameters'],
          properties: {
            apiVersion: { bsonType: 'string', minLength: 1, maxLength: 100 },
            parameters: { bsonType: 'object' },
          },
        } },
      } },
      validationLevel: 'strict', validationAction: 'error',
    });

    // No backfill: legacy attempts may already have reached Stripe with unknowable request defaults.
    await db.collection('_migrations').insertOne({ name: stripeRequestMigrationName, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};
