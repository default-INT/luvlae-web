import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { ClientSession, Db, Document, IndexDescription } from 'mongodb';

const id = { bsonType: 'objectId' };
const date = { bsonType: 'date' };
const text = { bsonType: 'string', minLength: 1, maxLength: 2000 };
const html = { bsonType: 'string', maxLength: 100000 };
const integer = { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 };
const environment = { enum: ['stage', 'production'] };

const validator = (properties: Document, optional: string[] = []) => ({ $jsonSchema: {
  bsonType: 'object', additionalProperties: false, properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)),
} });

const definitions: { name: string; validator: Document; indexes: IndexDescription[] }[] = [
  {
    name: 'notificationJobs',
    validator: validator({
      _id: id, schemaVersion: { enum: [1] }, templateVersion: { enum: ['1'] },
      locale: { enum: ['en'] }, key: text, environment, orderId: id, refundId: id,
      retryOf: id,
      type: { enum: ['order.paid', 'admin.order-paid', 'order.processing', 'order.shipped', 'order.delivered',
        'order.cancelled', 'refund.succeeded'] },
      eventKey: text, audience: { enum: ['buyer', 'admin'] }, recipient: text, recipientHash: text,
      adminUserId: id, content: { bsonType: 'object' }, sourceAt: date, createdAt: date, updatedAt: date,
      status: { enum: ['pending', 'sending', 'accepted', 'failed', 'unknown', 'suppressed', 'cancelled'] },
      delivery: { enum: ['unconfirmed', 'delayed', 'delivered', 'bounced', 'complained', 'failed'] },
      attempts: integer, nextAttemptAt: date, leaseToken: text, leaseUntil: date, firstRequestAt: date,
      outcomeUncertain: { bsonType: 'bool' },
      frozen: validator({ to: text, subject: text, html, text: html, idempotencyKey: text,
        from: text, replyTo: text, jobId: text }, ['from', 'replyTo']).$jsonSchema,
      providerMessageId: text, acceptedAt: date, lastErrorCode: text, lastEventAt: date,
    }, ['refundId', 'retryOf', 'adminUserId', 'leaseToken', 'leaseUntil', 'firstRequestAt',
      'outcomeUncertain', 'frozen',
      'providerMessageId', 'acceptedAt', 'lastErrorCode', 'lastEventAt']),
    indexes: [
      { key: { key: 1 }, unique: true, name: 'notification_key_unique' },
      { key: { status: 1, nextAttemptAt: 1, createdAt: 1 }, name: 'notification_due' },
      { key: { status: 1, leaseUntil: 1 }, name: 'notification_lease' },
      { key: { providerMessageId: 1 }, unique: true,
        partialFilterExpression: { providerMessageId: { $type: 'string' } }, name: 'notification_provider_unique' },
      { key: { orderId: 1, sourceAt: 1 }, name: 'notification_order' },
      { key: { retryOf: 1, createdAt: -1 }, name: 'notification_redelivery' },
      { key: { environment: 1, recipientHash: 1, status: 1 }, name: 'notification_recipient' },
    ],
  },
  {
    name: 'emailEvents',
    validator: validator({
      _id: id, schemaVersion: { enum: [1] }, provider: { enum: ['resend'] }, eventId: text,
      type: text, providerMessageId: text, jobId: id, occurredAt: date, receivedAt: date,
      lastAttemptAt: date,
      status: { enum: ['pending', 'applied', 'ignored'] },
    }, ['providerMessageId', 'jobId', 'lastAttemptAt']),
    indexes: [
      { key: { provider: 1, eventId: 1 }, unique: true, name: 'email_event_unique' },
      { key: { status: 1, providerMessageId: 1 }, name: 'email_event_unresolved' },
    ],
  },
  {
    name: 'emailSuppressions',
    validator: validator({
      _id: id, schemaVersion: { enum: [1] }, environment, recipientHash: text,
      reason: { enum: ['bounced', 'complained'] }, createdAt: date, updatedAt: date,
    }),
    indexes: [{ key: { environment: 1, recipientHash: 1 }, unique: true, name: 'email_suppression_unique' }],
  },
];

export const migrateNotifications = async (db: Db) => {
  const name = '006-notifications';

  if (await db.collection('_migrations').findOne({ name })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    for (const definition of definitions) {
      if (await db.listCollections({ name: definition.name }).hasNext()) {
        await db.command({ collMod: definition.name, validator: definition.validator,
          validationLevel: 'strict', validationAction: 'error' });
      } else {
        await db.createCollection(definition.name, { validator: definition.validator,
          validationLevel: 'strict', validationAction: 'error' });
      }

      await db.collection(definition.name).createIndexes(definition.indexes);
    }

    await db.collection('_migrations').insertOne({ name, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};

export const requireNotificationSchema = async (db: Db, session?: ClientSession) => {
  if (!await db.collection('_migrations').findOne({ name: '006-notifications' }, { session })) {
    fail(503, 'DATABASE_NOT_READY', 'Run the notification schema migration before enabling email.');
  }
};
