import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { Db, Document } from 'mongodb';

export const migrateAdminNotifications = async (db: Db) => {
  const name = '007-admin-notifications';

  if (await db.collection('_migrations').findOne({ name })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    const info = await db.listCollections({ name: 'adminUsers' }, { nameOnly: false }).next();
    const validator = info?.options?.validator as Document | undefined;

    if (!validator?.$jsonSchema?.properties) {
      fail(503, 'DATABASE_NOT_READY', 'Run the commerce schema migration first.');
    }

    const schema = validator!.$jsonSchema;

    const next = { ...schema, properties: { ...schema.properties, notify: {
      bsonType: 'object', additionalProperties: false, required: ['orders'],
      properties: { orders: { bsonType: 'bool' } },
    } } };

    // Permit the additive field before backfilling existing administrators.
    await db.command({ collMod: 'adminUsers', validator: { ...validator, $jsonSchema: next },
      validationLevel: 'strict', validationAction: 'error' });
    await db.collection('adminUsers').updateMany({ 'notify.orders': { $exists: false } }, {
      $set: { 'notify.orders': false },
    });
    await db.command({ collMod: 'adminUsers', validator: { ...validator, $jsonSchema: {
      ...next, required: [...new Set([...(next.required ?? []), 'notify'])],
    } }, validationLevel: 'strict', validationAction: 'error' });
    await db.collection('adminUsers').createIndex({ status: 1, 'notify.orders': 1 }, { name: 'admin_order_notifications' });
    await db.collection('_migrations').insertOne({ name, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};
