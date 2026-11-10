import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import { contiguousStates } from './shipping-address';

import type { ClientSession, Db, Document } from 'mongodb';

export const shippingMigrationName = '009-locked-shipping';

export const requireShippingSchema = async (db: Db, session?: ClientSession) => {
  if (!await db.collection('_migrations').findOne({ name: shippingMigrationName }, { session })) {
    fail(503, 'DATABASE_NOT_READY', 'Run shipping schema migration before checkout.');
  }
};

export const migrateLockedShipping = async (db: Db) => {
  if (await db.collection('_migrations').findOne({ name: shippingMigrationName })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    for (const name of ['orders', 'checkoutAttempts']) {
      const info = await db.listCollections({ name }, { nameOnly: false }).next();
      const validator = info?.options?.validator as Document | undefined;

      if (!validator?.$jsonSchema?.properties) fail(503, 'DATABASE_NOT_READY', 'Run commerce migrations first.');

      const schema = validator!.$jsonSchema;

      const address = { bsonType: 'object', additionalProperties: false,
        required: ['recipientName', 'line1', 'city', 'state', 'postalCode', 'country'], properties: {
          recipientName: { bsonType: 'string', minLength: 1, maxLength: 100 },
          line1: { bsonType: 'string', minLength: 1, maxLength: 200 },
          line2: { bsonType: 'string', minLength: 1, maxLength: 200 },
          city: { bsonType: 'string', minLength: 1, maxLength: 100 },
          state: { enum: contiguousStates },
          postalCode: { bsonType: 'string', pattern: '^\\d{5}(-\\d{4})?$' }, country: { enum: ['US'] },
        } };

      const includedTax = { bsonType: ['int', 'long', 'double'], minimum: 0,
        maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 };

      const properties = name === 'orders' ? { shippingPolicy: { enum: ['contiguous-us-v1'] },
        pricing: { ...schema.properties.pricing, properties: { ...schema.properties.pricing.properties,
          includedTax } } } : {
        shippingSnapshot: address,
        customerProvision: { bsonType: 'object', additionalProperties: false,
          required: ['state', 'idempotencyKey', 'apiVersion', 'parameters', 'createdAt'], properties: {
            state: { enum: ['pending', 'ready'] }, idempotencyKey: { bsonType: 'string', minLength: 1, maxLength: 200 },
            apiVersion: { bsonType: 'string', minLength: 1, maxLength: 100 }, parameters: { bsonType: 'object' },
            customerId: { bsonType: 'string', minLength: 1, maxLength: 200 }, createdAt: { bsonType: 'date' },
          } },
      };

      const invariant = name === 'orders' ? { $and: [
        { $or: [{ $eq: [{ $type: '$shippingPolicy' }, 'missing'] },
          { $ne: [{ $type: '$shippingAddress' }, 'missing'] }] },
        { $or: [{ $eq: [{ $type: '$pricing.includedTax' }, 'missing'] },
          { $lte: ['$pricing.includedTax', '$pricing.subtotal'] }] },
      ] } : { $or: [
        { $eq: [{ $type: '$customerProvision' }, 'missing'] },
        { $and: [
          { $ne: [{ $type: '$shippingSnapshot' }, 'missing'] },
          { $or: [
            { $and: [{ $eq: ['$customerProvision.state', 'pending'] },
              { $eq: [{ $type: '$customerProvision.customerId' }, 'missing'] }] },
            { $and: [{ $eq: ['$customerProvision.state', 'ready'] },
              { $eq: [{ $type: '$customerProvision.customerId' }, 'string'] }] },
          ] },
        ] },
      ] };

      await db.command({ collMod: name, validationLevel: 'strict', validationAction: 'error', validator: {
        ...validator, $jsonSchema: { ...schema, properties: { ...schema.properties, ...properties } },
        $expr: { $and: [...(validator!.$expr ? [validator!.$expr] : []), invariant] },
      } });
    }

    await db.collection('_migrations').insertOne({ name: shippingMigrationName, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};
