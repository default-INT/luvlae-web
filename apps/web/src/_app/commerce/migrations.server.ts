import 'server-only';

import { ObjectId } from 'mongodb';

import { migrateRefunds } from './refund-migration.server';
import { migrateMockOrders } from './mock-migration.server';
import { migrateStripeRequests } from './stripe-request-migration.server';

import type { Db, Document, IndexDescription } from 'mongodb';

const text = { bsonType: 'string', minLength: 1, maxLength: 2000 };
const date = { bsonType: 'date' };
const id = { bsonType: 'objectId' };
const bool = { bsonType: 'bool' };
const integer = { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 };
const positive = { ...integer, minimum: 1 };
const usd = { enum: ['USD'] };
const enumeration = (...values: string[]) => ({ enum: values });

const object = (properties: Document, required = Object.keys(properties)) => ({
  bsonType: 'object', additionalProperties: false, properties, required,
});

const array = (items: Document, maxItems = 20, minItems = 0) => ({ bsonType: 'array', items, maxItems, minItems });
const base = { _id: id, schemaVersion: { enum: [1] } };
const timed = { createdAt: date, updatedAt: date };

const item = object({
  productId: id, sku: text, name: text, quantity: positive,
  unitAmount: positive, lineSubtotal: integer, productVersion: positive,
});

const moneyOrUnknown = { ...integer, bsonType: ['int', 'long', 'double', 'null'] };

const pricing = object({
  state: enumeration('estimated', 'final'), subtotal: integer, discount: integer,
  shipping: moneyOrUnknown, tax: moneyOrUnknown, total: moneyOrUnknown,
});

const pricingPolicy = object({ shipping: text, tax: text, discount: text });
const actor = object({ type: enumeration('admin', 'system', 'stripe'), id }, ['type']);

const optional = (fields: Document, optionalKeys: string[]) => object(fields,
  Object.keys(fields).filter(key => !optionalKeys.includes(key)));

interface Definition { name: string; schema: Document; indexes: IndexDescription[]; expression?: Document }

const definitions: Definition[] = [
  {
    name: 'products',
    schema: object({
      ...base, sku: { ...text, pattern: '^[A-Z0-9][A-Z0-9_-]{0,63}$' }, name: text,
      shortDescription: { bsonType: 'string', maxLength: 2000 },
      price: object({ currency: usd, unitAmount: positive }),
      inventory: object({ stockQuantity: integer, reservedQuantity: integer }),
      salesEnabled: bool, version: positive, ...timed, updatedBy: id,
    }),
    expression: { $lte: ['$inventory.reservedQuantity', '$inventory.stockQuantity'] },
    indexes: [
      { key: { sku: 1 }, unique: true, name: 'sku_unique' },
      { key: { createdAt: -1, _id: -1 }, name: 'products_recent' },
    ],
  },
  {
    name: 'orders',
    schema: optional({
      ...base, version: positive, orderNumber: text, creationKeyHash: text, creationRequestHash: text,
      guestAccess: object({ tokenHash: text, expiresAt: date }), items: array(item, 20, 1), currency: usd,
      pricing, pricingPolicy,
      customer: optional({ email: text, name: text, phone: text }, ['phone']),
      shippingAddress: optional({
        recipientName: text, line1: text, line2: text, city: text, state: text, postalCode: text, country: { enum: ['US'] },
      }, ['line2']),
      orderStatus: enumeration('open', 'completed', 'cancelled'),
      payment: optional({
        status: enumeration('pending', 'processing', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'),
        activeAttemptId: id, settledAttemptId: id, amountPaid: integer, amountRefunded: integer,
        paidAt: date, disputed: bool, reconciliationRequired: bool,
      }, ['activeAttemptId', 'settledAttemptId', 'paidAt']),
      fulfillment: optional({
        status: enumeration('unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'),
        carrier: text, trackingNumber: text, processingAt: date, shippedAt: date, deliveredAt: date,
      }, ['carrier', 'trackingNumber', 'processingAt', 'shippedAt', 'deliveredAt']),
      cancellation: object({ reason: text, cancelledAt: date, cancelledBy: id }),
      restockedQuantities: { bsonType: 'object', additionalProperties: integer },
      notifications: array(object({
        key: text, type: text, status: enumeration('pending', 'sent'), attempts: integer, nextAttemptAt: date,
      }), 10),
      ...timed, completedAt: date,
    }, ['customer', 'shippingAddress', 'cancellation', 'completedAt']),
    indexes: [
      { key: { orderNumber: 1 }, unique: true, name: 'order_number_unique' },
      { key: { creationKeyHash: 1 }, unique: true, name: 'creation_key_unique' },
      { key: { createdAt: -1, _id: -1 }, name: 'orders_recent' },
      { key: { orderStatus: 1, createdAt: -1, _id: -1 }, name: 'orders_status' },
      { key: { 'payment.status': 1, 'fulfillment.status': 1, createdAt: -1, _id: -1 }, name: 'orders_queue' },
    ],
  },
  {
    name: 'checkoutAttempts',
    schema: optional({
      ...base, orderId: id, requestKeyHash: text, requestHash: text, stripeIdempotencyKey: text,
      state: enumeration('creating', 'open', 'processing', 'succeeded', 'failed', 'expired', 'cancelled'), active: bool,
      quoteSnapshot: object({ items: array(item, 20, 1), currency: usd, pricing, pricingPolicy }),
      inventoryReservation: optional({
        state: enumeration('held', 'committed', 'released'),
        items: array(object({ productId: id, quantity: positive }), 20, 1),
        expiresAt: date, committedAt: date, releasedAt: date,
      }, ['committedAt', 'releasedAt']),
      stripeSessionId: text, stripePaymentIntentId: text, livemode: bool, ...timed,
    }, ['stripeSessionId', 'stripePaymentIntentId']),
    indexes: [
      { key: { requestKeyHash: 1 }, unique: true, name: 'attempt_request_unique' },
      { key: { stripeIdempotencyKey: 1 }, unique: true, name: 'stripe_key_unique' },
      { key: { orderId: 1 }, unique: true, partialFilterExpression: { active: true }, name: 'one_active_attempt' },
      ...['stripeSessionId', 'stripePaymentIntentId'].map(field => ({
        key: { [field]: 1 as const }, unique: true,
        partialFilterExpression: { [field]: { $type: 'string' } }, name: `${field}_unique`,
      })),
      { key: { orderId: 1, createdAt: -1 }, name: 'attempt_history' },
      { key: { active: 1, updatedAt: 1 }, name: 'attempt_reconcile' },
    ],
  },
  {
    name: 'paymentEvents',
    schema: optional({
      ...base, provider: { enum: ['stripe'] }, eventId: text, eventType: text, providerObjectId: text,
      livemode: bool, orderId: id, attemptId: id, providerCreatedAt: date, receivedAt: date,
      status: enumeration('pending', 'processing', 'processed', 'ignored', 'failed'), processingAttempts: integer,
      nextAttemptAt: date, leaseUntil: date, leaseToken: text, processedAt: date, lastErrorCode: text,
    }, ['orderId', 'attemptId', 'leaseUntil', 'leaseToken', 'processedAt', 'lastErrorCode']),
    indexes: [
      { key: { provider: 1, eventId: 1 }, unique: true, name: 'provider_event_unique' },
      { key: { status: 1, nextAttemptAt: 1 }, name: 'event_retry' },
      { key: { status: 1, leaseUntil: 1 }, name: 'event_lease' },
      { key: { orderId: 1, receivedAt: -1 }, name: 'event_order' },
    ],
  },
  {
    name: 'paymentTransactions',
    schema: object({
      ...base, operationId: text, orderId: id, attemptId: id, provider: { enum: ['stripe'] },
      providerObjectId: text, providerEventId: text, type: enumeration('payment', 'refund', 'dispute'),
      status: enumeration('pending', 'succeeded', 'failed', 'cancelled'), amount: integer, currency: usd,
      livemode: bool, occurredAt: date, recordedAt: date,
    }),
    indexes: [
      { key: { operationId: 1 }, unique: true, name: 'transaction_operation_unique' },
      { key: { provider: 1, providerEventId: 1, providerObjectId: 1, type: 1, status: 1 },
        unique: true, name: 'transaction_observation_unique' },
      { key: { orderId: 1, recordedAt: -1, _id: -1 }, name: 'transaction_order' },
      { key: { recordedAt: -1, _id: -1 }, name: 'transactions_recent' },
    ],
  },
  {
    name: 'adminUsers',
    schema: optional({
      ...base, email: text, emailNormalized: text, passwordHash: text, status: enumeration('active', 'disabled'),
      sessionVersion: positive, passwordChangedAt: date, lastLoginAt: date, ...timed,
    }, ['lastLoginAt']),
    indexes: [{ key: { emailNormalized: 1 }, unique: true, name: 'admin_email_unique' }],
  },
  {
    name: 'adminSessions',
    schema: optional({
      ...base, adminUserId: id, tokenHash: text, sessionVersion: positive, createdAt: date, expiresAt: date, revokedAt: date,
    }, ['revokedAt']),
    indexes: [
      { key: { tokenHash: 1 }, unique: true, name: 'session_token_unique' },
      { key: { adminUserId: 1 }, name: 'session_user' },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'session_expiry' },
    ],
  },
  {
    name: 'auditLog',
    schema: optional({
      ...base, operationId: text, requestHash: text, actor, entityType: enumeration('product', 'order', 'checkoutAttempt'),
      entityId: id, action: text, changes: { bsonType: 'object' }, reason: text, createdAt: date,
    }, ['reason']),
    indexes: [
      { key: { operationId: 1 }, unique: true, name: 'audit_operation_unique' },
      { key: { entityType: 1, entityId: 1, createdAt: -1 }, name: 'audit_entity' },
    ],
  },
  {
    name: 'loginLimits',
    schema: object({ _id: text, count: positive, expiresAt: date }),
    indexes: [{ key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'login_limit_expiry' }],
  },
];

// Add new migrations instead of editing this migration after it is applied to a shared environment.
const migrateFoundation = async (db: Db) => {
  await db.collection('_migrations').createIndex({ name: 1 }, { unique: true, name: 'migration_name_unique' });
  const completed = await db.collection('_migrations').findOne({ name: '001-commerce' });

  if (completed) return;

  const owner = new ObjectId().toHexString();
  // No automatic lease takeover: an interrupted migration must be inspected before its lock is removed.
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    for (const definition of definitions) {
      const validator: Document = { $jsonSchema: definition.schema };

      if (definition.expression) validator.$expr = definition.expression;

      const exists = await db.listCollections({ name: definition.name }, { nameOnly: true }).hasNext();

      if (exists) {
        await db.command({ collMod: definition.name, validator, validationLevel: 'strict', validationAction: 'error' });
      } else {
        await db.createCollection(definition.name, { validator, validationLevel: 'strict', validationAction: 'error' });
      }

      await db.collection(definition.name).createIndexes(definition.indexes);
    }

    await db.collection('_migrations').insertOne({ name: '001-commerce', appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};

export const migrateCommerce = async (db: Db) => {
  await migrateFoundation(db);
  await migrateMockOrders(db);
  await migrateStripeRequests(db);
  await migrateRefunds(db);
};
