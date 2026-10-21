import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { ClientSession, Db, Document } from 'mongodb';

export const migrateRefunds = async (db: Db) => {
  const name = '005-refunds';

  if (await db.collection('_migrations').findOne({ name })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    const text = { bsonType: 'string', minLength: 1, maxLength: 2000 };
    const id = { bsonType: 'objectId' };
    const integer = { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 };
    const date = { bsonType: 'date' };
    const info = await db.listCollections({ name: 'orders' }, { nameOnly: false }).next();
    const validator = info?.options?.validator as Document | undefined;

    if (!validator?.$jsonSchema?.properties) fail(503, 'DATABASE_NOT_READY', 'Run the commerce schema migration first.');

    const schema = validator!.$jsonSchema;
    await db.command({ collMod: 'orders', validator: { ...validator, $jsonSchema: {
      ...schema, properties: { ...schema.properties, cancellationRequest: {
        bsonType: 'object', additionalProperties: false, required: ['status', 'reason', 'operationId', 'adminId'],
        properties: { status: { enum: ['pending', 'succeeded'] }, reason: text, operationId: text, adminId: id },
      } },
    } }, validationLevel: 'strict', validationAction: 'error' });

    const properties = {
      _id: id, schemaVersion: { enum: [1] }, orderId: id, attemptId: id,
      operationId: text, requestHash: text, requestedVersion: integer,
      source: { enum: ['admin', 'stripe', 'mock'] }, kind: { enum: ['cancel', 'refund'] },
      amount: integer, currency: { enum: ['USD'] },
      status: { enum: ['requested', 'pending', 'succeeded', 'failed', 'cancelled', 'unknown'] },
      active: { bsonType: 'bool' }, livemode: { bsonType: 'bool' },
      reason: text, providerReason: text, failureReason: text, adminId: id,
      providerRefundId: text, stripePaymentIntentId: text, providerRequestStartedAt: date,
      stripeApiVersion: text, providerStatus: text,
      leaseToken: text, leaseUntil: date,
      createdAt: date, updatedAt: date,
    };

    const optional = ['attemptId', 'reason', 'providerReason', 'failureReason', 'adminId', 'providerRefundId',
      'stripePaymentIntentId', 'providerRequestStartedAt', 'stripeApiVersion', 'providerStatus', 'leaseToken', 'leaseUntil'];

    const refundValidator = { $jsonSchema: {
      bsonType: 'object', additionalProperties: false, properties,
      required: Object.keys(properties).filter(key => !optional.includes(key)),
    } };

    if (await db.listCollections({ name: 'refunds' }).hasNext()) {
      await db.command({ collMod: 'refunds', validator: refundValidator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection('refunds', { validator: refundValidator, validationLevel: 'strict', validationAction: 'error' });
    }

    await db.collection('refunds').createIndexes([
      { key: { operationId: 1 }, unique: true, name: 'refund_operation_unique' },
      { key: { providerRefundId: 1 }, unique: true, partialFilterExpression: { providerRefundId: { $type: 'string' } },
        name: 'refund_provider_unique' },
      { key: { orderId: 1 }, unique: true, partialFilterExpression: { active: true, source: { $in: ['admin', 'mock'] } },
        name: 'refund_active_order' },
      { key: { orderId: 1, createdAt: -1 }, name: 'refund_order_history' },
      { key: { active: 1, updatedAt: 1 }, name: 'refund_recovery' },
    ]);
    await db.collection('_migrations').insertOne({ name, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};

export const requireRefundSchema = async (db: Db, session?: ClientSession) => {
  if (!await db.collection('_migrations').findOne({ name: '005-refunds' }, { session })) {
    fail(503, 'DATABASE_NOT_READY', 'Run the refund schema migration before using refund operations.');
  }
};
