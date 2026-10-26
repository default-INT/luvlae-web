import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { collections } from '../src/_app/commerce/collections.server';
import { fulfillmentSchema } from '../src/_app/commerce/contracts';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { migrateAdminNotifications } from '../src/_app/commerce/admin-notifications-migration.server';
import { cancelOrder, refundOrder } from '../src/_app/commerce/refunds.server';
import { updateFulfillment } from '../src/_app/commerce/orders.server';
import { createMockOrder } from '../src/_app/commerce/mock-checkout.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { randomToken } from '../src/shared/lib/security/index.server';

import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;
const adminId = new ObjectId();
const envNames = ['APP_ENV', 'RESEND_API_KEY', 'MOCK_CHECKOUT_ENABLED'] as const;
const originalEnv = new Map<string, string | undefined>();

before(async () => {
  for (const name of envNames) originalEnv.set(name, process.env[name]);

  process.env.APP_ENV = 'stage';
  process.env.RESEND_API_KEY = 'synthetic-resend-key';
  process.env.MOCK_CHECKOUT_ENABLED = 'true';

  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db(`email_lifecycle_${randomUUID().replaceAll('-', '')}`) };
  await migrateCommerce(context.db);
  const now = new Date();
  await collections(context.db).users.insertMany([
    { _id: adminId, schemaVersion: 1, email: 'active@example.test', emailNormalized: 'active@example.test',
      passwordHash: 'synthetic', status: 'active', notify: { orders: true }, sessionVersion: 1,
      passwordChangedAt: now, createdAt: now, updatedAt: now },
    { _id: new ObjectId(), schemaVersion: 1, email: 'inactive@example.test', emailNormalized: 'inactive@example.test',
      passwordHash: 'synthetic', status: 'disabled', notify: { orders: true }, sessionVersion: 1,
      passwordChangedAt: now, createdAt: now, updatedAt: now },
    { _id: new ObjectId(), schemaVersion: 1, email: 'muted@example.test', emailNormalized: 'muted@example.test',
      passwordHash: 'synthetic', status: 'active', notify: { orders: false }, sessionVersion: 1,
      passwordChangedAt: now, createdAt: now, updatedAt: now },
  ]);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();

  for (const name of envNames) {
    const value = originalEnv.get(name);

    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const makeMockOrder = async (label: string) => {
  const sku = `EMAIL-${label}-${randomUUID().slice(0, 8).toUpperCase()}`;
  await createProduct(context, adminId, { sku, name: `Synthetic ${label}`, shortDescription: '', unitAmount: 2500,
    stockQuantity: 10, salesEnabled: true, operationId: randomUUID() });
  const guestToken = randomToken();

  const result = await createMockOrder(context, { operationId: randomUUID(), guestToken,
    items: [{ sku, quantity: 1, productVersion: 1 }] });

  return { orderId: new ObjectId(result.id), sku };
};

const jobsFor = (orderId: ObjectId) => context.db.collection('notificationJobs').find({ orderId }).toArray();

const updateStatus = async (orderId: ObjectId, status: 'processing' | 'shipped' | 'delivered') => {
  const order = await collections(context.db).orders.findOne({ _id: orderId });
  assert.ok(order);

  const input = fulfillmentSchema.parse({ version: order.version, operationId: randomUUID(), status,
    ...(status === 'shipped' ? { carrier: 'usps', trackingNumber: '9400111899223856928490' } : {}) });

  await updateFulfillment(context, adminId, orderId, input);
};

test('mock paid-order replay creates one buyer job and only opted-in active admin jobs', async () => {
  const sku = `EMAIL-PAID-${randomUUID().slice(0, 8).toUpperCase()}`;
  await createProduct(context, adminId, { sku, name: 'Synthetic paid order', shortDescription: '', unitAmount: 2500,
    stockQuantity: 10, salesEnabled: true, operationId: randomUUID() });
  const guestToken = randomToken();
  const input = { operationId: randomUUID(), guestToken, items: [{ sku, quantity: 1, productVersion: 1 }] };
  const created = await createMockOrder(context, input);
  const replay = await createMockOrder(context, input);
  assert.equal(replay.id, created.id);
  assert.equal(replay.replayed, true);

  const jobs = await jobsFor(new ObjectId(created.id));
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map(job => [job.type, job.audience]).sort(), [
    ['admin.order-paid', 'admin'], ['order.paid', 'buyer'],
  ]);
  assert.deepEqual(jobs.filter(job => job.audience === 'admin').map(job => job.recipient), ['active@example.test']);
});

test('fulfillment queues each transition and cancels unsent progress made obsolete by later transitions', async () => {
  const { orderId } = await makeMockOrder('FULFILL');
  await updateStatus(orderId, 'processing');
  await updateStatus(orderId, 'shipped');
  await updateStatus(orderId, 'delivered');

  const jobs = await jobsFor(orderId);
  const byType = new Map(jobs.map(job => [job.type, job]));
  assert.equal(byType.get('order.processing')?.status, 'cancelled');
  assert.equal(byType.get('order.shipped')?.status, 'cancelled');
  assert.equal(byType.get('order.delivered')?.status, 'pending');
  assert.equal(jobs.filter(job => ['order.processing', 'order.shipped', 'order.delivered'].includes(job.type)).length, 3);
});

test('mock cancellation combines cancellation and refund in one customer message', async () => {
  const { orderId } = await makeMockOrder('CANCEL');
  const order = await collections(context.db).orders.findOne({ _id: orderId });
  assert.ok(order);

  const result = await cancelOrder(context, adminId, orderId, { version: order.version, operationId: randomUUID(),
    reason: 'Synthetic cancellation' });

  assert.equal(result.status, 'succeeded');

  const jobs = await jobsFor(orderId);
  assert.equal(jobs.filter(job => job.type === 'order.cancelled').length, 1);
  assert.equal(jobs.filter(job => job.type === 'refund.succeeded').length, 0);
  assert.equal(jobs.find(job => job.type === 'order.cancelled')?.content.refundAmount, 2500);
});

test('mock refund for a shipped order creates one refund message', async () => {
  const { orderId } = await makeMockOrder('REFUND');
  await updateStatus(orderId, 'processing');
  await updateStatus(orderId, 'shipped');
  const order = await collections(context.db).orders.findOne({ _id: orderId });
  assert.ok(order);
  const input = { version: order.version, operationId: randomUUID(), reason: 'Synthetic refund' };
  const result = await refundOrder(context, adminId, orderId, input);
  assert.equal(result.status, 'succeeded');
  await refundOrder(context, adminId, orderId, input);

  const jobs = await jobsFor(orderId);
  assert.equal(jobs.filter(job => job.type === 'refund.succeeded').length, 1);
});

test('stage queues notifications without a runtime email switch', async () => {
  const { orderId } = await makeMockOrder('ALWAYS_ON');
  await updateStatus(orderId, 'processing');
  const jobs = await jobsFor(orderId);
  assert.ok(jobs.some(job => job.type === 'order.paid' && job.recipient === 'checkout@example.test'));
  assert.ok(jobs.some(job => job.type === 'admin.order-paid'));
  assert.ok(jobs.some(job => job.type === 'order.processing'));
});

test('admin notification migration defaults legacy preferences off and rejects non-boolean values', async () => {
  const dbName = `email_migration_${randomUUID().replaceAll('-', '')}`;
  const db = context.client.db(dbName);
  await migrateCommerce(db);
  const validatorInfo = await db.listCollections({ name: 'adminUsers' }, { nameOnly: false }).next();
  assert.ok(validatorInfo?.options?.validator);

  const validator = structuredClone(validatorInfo.options.validator as {
    $jsonSchema: { properties: Record<string, unknown>; required: string[] };
  });

  delete validator.$jsonSchema.properties.notify;
  validator.$jsonSchema.required = validator.$jsonSchema.required.filter(field => field !== 'notify');
  await db.command({ collMod: 'adminUsers', validator, validationLevel: 'strict', validationAction: 'error' });
  await db.collection('_migrations').deleteOne({ name: '007-admin-notifications' });

  const legacy = { _id: new ObjectId(), schemaVersion: 1, email: 'legacy@example.test',
    emailNormalized: 'legacy@example.test', passwordHash: 'synthetic', status: 'active', sessionVersion: 1,
    passwordChangedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };

  await db.collection('adminUsers').insertOne(legacy);
  await migrateAdminNotifications(db);

  assert.deepEqual((await db.collection('adminUsers').findOne({ _id: legacy._id }))?.notify, { orders: false });
  await assert.rejects(db.collection('adminUsers').insertOne({ ...legacy, _id: new ObjectId(),
    email: 'invalid@example.test', emailNormalized: 'invalid@example.test', notify: { orders: 'true' } }));
  await db.dropDatabase();
});
