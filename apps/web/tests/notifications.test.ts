import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { dispatchNotificationBatch } from '../src/_app/commerce/notification-dispatch.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { enqueueOrderNotification, retryNotificationJob } from '../src/_app/commerce/notifications.server';
import { reconcilePendingEmailEvents } from '../src/_app/commerce/notification-webhook.server';
import { inTransaction } from '../src/shared/lib/mongodb/index.server';
import { hashToken } from '../src/shared/lib/security/index.server';

import type { Order } from '../src/_app/commerce/models';
import type { NotificationJob } from '../src/_app/commerce/notification-types.server';
import type { DatabaseContext } from '../src/shared/lib/mongodb/index.server';

let replica: MongoMemoryReplSet;
let context: DatabaseContext;

const makeOrder = (): Order => {
  const now = new Date();
  const id = new ObjectId();

  return {
    _id: id, schemaVersion: 1, version: 1, orderNumber: `TEST-${id.toHexString()}`,
    creationKeyHash: hashToken(randomUUID()), creationRequestHash: hashToken(randomUUID()),
    guestAccess: { tokenHash: hashToken(randomUUID()), expiresAt: new Date(now.getTime() + 3600000) },
    items: [{ productId: new ObjectId(), sku: 'TEST', name: 'Synthetic test product', quantity: 2,
      unitAmount: 1250, lineSubtotal: 2500, productVersion: 1 }],
    currency: 'USD', pricing: { state: 'final', subtotal: 2500, discount: 0, shipping: 0, tax: 0, total: 2500 },
    pricingPolicy: { shipping: 'test', tax: 'test', discount: 'test' },
    customer: { email: 'buyer@example.test', name: 'Buyer' }, orderStatus: 'completed',
    payment: { status: 'paid', amountPaid: 2500, amountRefunded: 0, disputed: false,
      reconciliationRequired: false, paidAt: now },
    fulfillment: { status: 'unfulfilled' }, restockedQuantities: {}, notifications: [],
    createdAt: now, updatedAt: now, completedAt: now,
  };
};

before(async () => {
  process.env.APP_ENV = 'stage';
  process.env.RESEND_API_KEY = 'test-key';
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  context = { client, db: client.db('notification_tests') };
  await migrateCommerce(context.db);
}, { timeout: 120000 });

after(async () => {
  await context?.client.close();
  await replica?.stop();
  delete process.env.RESEND_API_KEY;
});

test('enqueue rolls back with the order and deduplicates per buyer/admin recipient', async () => {
  const order = makeOrder();
  const adminId = new ObjectId();
  const now = new Date();
  await context.db.collection('adminUsers').insertOne({
    _id: adminId, schemaVersion: 1, email: 'admin@example.test', emailNormalized: 'admin@example.test',
    passwordHash: 'synthetic', status: 'active', notify: { orders: true }, sessionVersion: 1,
    passwordChangedAt: now, createdAt: now, updatedAt: now,
  });

  await assert.rejects(inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
    throw new Error('rollback');
  }));

  assert.equal(await context.db.collection('notificationJobs').countDocuments({ orderId: order._id }), 0);

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
    await enqueueOrderNotification(context.db, session, order, 'admin.order-paid');
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const jobs = await context.db.collection<NotificationJob>('notificationJobs').find({ orderId: order._id }).toArray();
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].key, jobs[1].key);
  assert.deepEqual(new Set(jobs.map(job => job.recipientHash)), new Set([
    hashToken('buyer@example.test'), hashToken('admin@example.test'),
  ]));
});

test('leased stage dispatch sends to each job recipient and accepts one send per job', async () => {
  const originalFetch = globalThis.fetch;
  const requests: { to: string[]; subject: string }[] = [];
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { to: string[]; subject: string };
    requests.push(body);
    return Response.json({ id: `email-${requests.length}` });
  }) as typeof fetch;

  try {
    const [first, second] = await Promise.all([
      dispatchNotificationBatch(context.db, 1), dispatchNotificationBatch(context.db, 1),
    ]);

    const states = await context.db.collection<NotificationJob>('notificationJobs').find({}).toArray();

    assert.equal(first.accepted + second.accepted, 2,
      JSON.stringify({ first, second, states: states.map(job => ({ status: job.status, code: job.lastErrorCode })) }));
    assert.equal(requests.length, 2);
    assert.deepEqual(new Set(requests.map(request => request.to[0])), new Set(['buyer@example.test', 'admin@example.test']));
    assert.ok(requests.every(request => request.subject.startsWith('[STAGE] ')));
    const jobs = await context.db.collection<NotificationJob>('notificationJobs').find({ status: 'accepted' }).toArray();
    assert.equal(jobs.length, 2);
    assert.deepEqual(new Set(jobs.map(job => job.frozen?.to)), new Set(['buyer@example.test', 'admin@example.test']));
    assert.ok(jobs.every(job => job.frozen?.from));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('unknown earlier outcome does not block a later factual order event', async () => {
  const order = makeOrder();
  order.fulfillment = { status: 'processing', processingAt: new Date(order.createdAt.getTime() + 1000) };

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
    await enqueueOrderNotification(context.db, session, order, 'order.processing');
  });

  await context.db.collection<NotificationJob>('notificationJobs').updateOne({
    orderId: order._id, type: 'order.paid',
  }, { $set: { status: 'unknown', lastErrorCode: 'EMAIL_PROVIDER_OUTCOME_UNKNOWN' } });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ id: randomUUID() })) as typeof fetch;

  try {
    const result = await dispatchNotificationBatch(context.db, 1);
    assert.equal(result.accepted, 1);

    const later = await context.db.collection<NotificationJob>('notificationJobs').findOne({
      orderId: order._id, type: 'order.processing',
    });

    assert.equal(later?.status, 'accepted');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an ambiguous attempt followed by a definite rejection remains unknown', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;

    if (attempts === 1) throw new Error('Synthetic network timeout');

    return Response.json({ message: 'Synthetic rejection' }, { status: 400 });
  }) as typeof fetch;

  try {
    const first = await dispatchNotificationBatch(context.db, 1);
    assert.equal(first.claimed, 1);
    await context.db.collection<NotificationJob>('notificationJobs').updateOne({
      orderId: order._id, type: 'order.paid',
    }, { $set: { nextAttemptAt: new Date(0) } });

    const second = await dispatchNotificationBatch(context.db, 1);

    const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({
      orderId: order._id, type: 'order.paid',
    });

    assert.equal(second.unknown, 1);
    assert.equal(attempts, 2);
    assert.equal(job?.status, 'unknown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a callback received before send response recovers the sending job', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({
    orderId: order._id, type: 'order.paid',
  });

  assert.ok(job);
  const now = new Date();
  await context.db.collection<NotificationJob>('notificationJobs').updateOne({ _id: job._id }, {
    $set: { status: 'sending', leaseToken: randomUUID(), leaseUntil: new Date(now.getTime() + 60000),
      firstRequestAt: now, frozen: { to: 'stage@example.test', from: 'Luvlae <notify@luvlae.com>',
        subject: '[STAGE] Test', html: '<p>Test</p>', text: 'Test', idempotencyKey: job.key,
        jobId: job._id.toHexString() } },
  });

  const providerMessageId = `email-${randomUUID()}`;
  await context.db.collection('emailEvents').insertOne({
    _id: new ObjectId(), schemaVersion: 1, provider: 'resend', eventId: randomUUID(),
    type: 'email.delivered', providerMessageId, jobId: job._id,
    occurredAt: now, receivedAt: now, status: 'pending',
  });

  await reconcilePendingEmailEvents(context.db);
  const recovered = await context.db.collection<NotificationJob>('notificationJobs').findOne({ _id: job._id });
  assert.equal(recovered?.status, 'accepted');
  assert.equal(recovered?.providerMessageId, providerMessageId);
  assert.equal(recovered?.delivery, 'delivered');
  assert.equal(recovered?.leaseToken, undefined);
});

test('delivery failure retry creates one child with a fresh provider key', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const original = await context.db.collection<NotificationJob>('notificationJobs').findOne({
    orderId: order._id, type: 'order.paid',
  });

  assert.ok(original);
  await context.db.collection<NotificationJob>('notificationJobs').updateOne({ _id: original._id }, {
    $set: { status: 'accepted', delivery: 'failed', acceptedAt: new Date(),
      providerMessageId: `email-${randomUUID()}` },
  });

  const adminId = new ObjectId();
  const operationId = randomUUID();
  assert.equal(await inTransaction(context, session => retryNotificationJob(
    context.db, session, original._id, adminId, operationId,
  )), true);

  const jobs = await context.db.collection<NotificationJob>('notificationJobs').find({ orderId: order._id }).toArray();
  assert.equal(jobs.length, 2);
  const child = jobs.find(job => job.retryOf?.equals(original._id));
  assert.ok(child);
  assert.equal(child.status, 'pending');
  assert.equal(child.providerMessageId, undefined);
  assert.equal(child.acceptedAt, undefined);
  assert.equal(child.frozen, undefined);
  assert.notEqual(child.key, original.key);
  assert.equal(jobs.find(job => job._id.equals(original._id))?.status, 'accepted');

  assert.equal(await inTransaction(context, session => retryNotificationJob(
    context.db, session, original._id, adminId, randomUUID(),
  )), false);

  await context.db.collection<NotificationJob>('notificationJobs').updateOne({ _id: child._id }, {
    $set: { status: 'cancelled' },
  });
});

test('definite preflight failure does not leave a false request time', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const result = await dispatchNotificationBatch(context.db, 1);
    assert.equal(result.failed, 1);
  } finally {
    process.env.RESEND_API_KEY = originalKey;
  }

  const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({
    orderId: order._id, type: 'order.paid',
  });

  assert.equal(job?.firstRequestAt, undefined);
  assert.equal(job?.outcomeUncertain, undefined);
});

test('pending provider-only callbacks rotate so a later match can reconcile', async () => {
  const now = new Date();
  const ids = Array.from({ length: 21 }, () => randomUUID());

  await context.db.collection('emailEvents').insertMany(ids.map((eventId, index) => ({
    _id: new ObjectId(), schemaVersion: 1, provider: 'resend', eventId,
    type: 'email.delivered', providerMessageId: `missing-${eventId}`,
    occurredAt: now, receivedAt: new Date(now.getTime() + index), status: 'pending',
  })));

  await reconcilePendingEmailEvents(context.db, 20);

  const untouched = await context.db.collection('emailEvents').countDocuments({
    eventId: { $in: ids }, lastAttemptAt: { $exists: false },
  });

  assert.equal(untouched, 1);

  await reconcilePendingEmailEvents(context.db, 20);

  const stillUntouched = await context.db.collection('emailEvents').countDocuments({
    eventId: { $in: ids }, lastAttemptAt: { $exists: false },
  });

  assert.equal(stillUntouched, 0);
});

test('refund jobs link to UUID operation and provider refund identifiers', async () => {
  const checkLookup = async (eventKey: string) => {
    const order = makeOrder();
    const refundId = new ObjectId();
    const now = new Date();

    await inTransaction(context, async session => {
      await context.db.collection<Order>('orders').insertOne(order, { session });
      await context.db.collection('refunds').insertOne({
        _id: refundId, schemaVersion: 1, orderId: order._id,
        operationId: eventKey.startsWith('re_') ? randomUUID() : eventKey,
        ...(eventKey.startsWith('re_') ? { providerRefundId: eventKey } : {}),
        requestHash: hashToken(randomUUID()), requestedVersion: 1, source: 'stripe', kind: 'refund',
        amount: 500, currency: 'USD', status: 'succeeded', active: false, livemode: false,
        createdAt: now, updatedAt: now,
      }, { session });
      await enqueueOrderNotification(context.db, session, order, 'refund.succeeded', eventKey, 500);
    });

    const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({
      orderId: order._id, type: 'refund.succeeded',
    });

    assert.equal(job?.refundId?.toHexString(), refundId.toHexString());
  };

  await checkLookup(randomUUID());
  await checkLookup(`re_${randomUUID().replaceAll('-', '')}`);
});

test('a signed shared-account callback cannot update a foreign-environment job', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({ orderId: order._id });
  assert.ok(job);
  const now = new Date();
  await context.db.collection<NotificationJob>('notificationJobs').updateOne({ _id: job._id }, { $set: {
    environment: 'production', status: 'sending', firstRequestAt: now,
    frozen: { to: job.recipient, from: 'Luvlae <orders@luvlae.com>', subject: 'Test',
      html: '<p>Test</p>', text: 'Test', idempotencyKey: job.key, jobId: job._id.toHexString() },
  } });

  const eventId = randomUUID();
  await context.db.collection('emailEvents').insertOne({
    _id: new ObjectId(), schemaVersion: 1, provider: 'resend', eventId,
    type: 'email.delivered', providerMessageId: `email-${randomUUID()}`, jobId: job._id,
    occurredAt: now, receivedAt: now, status: 'pending',
  });

  await reconcilePendingEmailEvents(context.db);
  assert.equal((await context.db.collection('emailEvents').findOne({ eventId }))?.status, 'ignored');
  assert.equal((await context.db.collection<NotificationJob>('notificationJobs').findOne({ _id: job._id }))?.status,
    'sending');
});

test('queued paid confirmations become obsolete after cancellation', async () => {
  const order = makeOrder();

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.paid');
  });

  await context.db.collection<Order>('orders').updateOne({ _id: order._id }, {
    $set: { orderStatus: 'cancelled', 'fulfillment.status': 'cancelled' },
  });

  const originalFetch = globalThis.fetch;
  const sentJobs: string[] = [];

  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { tags: { name: string; value: string }[] };
    sentJobs.push(body.tags.find(tag => tag.name === 'job')!.value);
    return Response.json({ id: `email-${randomUUID()}` });
  }) as typeof fetch;

  try {
    await dispatchNotificationBatch(context.db, 20);
    const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({ orderId: order._id });
    assert.equal(job?.status, 'cancelled');
    assert.equal(job?.lastErrorCode, 'EVENT_OBSOLETE');
    assert.ok(!sentJobs.includes(job!._id.toHexString()));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('an unpaid cancellation notice is suppressed if a late payment arrives', async contextTest => {
  contextTest.mock.method(globalThis, 'fetch', async () => Response.json({ id: `email-${randomUUID()}` }));
  const order = makeOrder();
  order.orderStatus = 'cancelled';
  order.fulfillment.status = 'cancelled';
  order.payment.amountPaid = 0;
  order.payment.status = 'expired';

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.cancelled');
  });

  await context.db.collection<Order>('orders').updateOne({ _id: order._id }, {
    $set: { 'payment.amountPaid': 2500, 'payment.status': 'paid', 'payment.reconciliationRequired': true },
  });

  await dispatchNotificationBatch(context.db, 20);
  const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({ orderId: order._id });
  assert.equal(job?.status, 'cancelled');
  assert.equal(job?.lastErrorCode, 'EVENT_OBSOLETE');
});

test('unfinalized cancellation totals stay unknown after MongoDB storage', async () => {
  const order = makeOrder();
  order.orderStatus = 'cancelled';
  order.fulfillment.status = 'cancelled';
  order.payment.amountPaid = 0;
  order.payment.status = 'expired';
  order.pricing = { ...order.pricing, state: 'estimated', total: null, tax: null, shipping: null };

  await inTransaction(context, async session => {
    await context.db.collection<Order>('orders').insertOne(order, { session });
    await enqueueOrderNotification(context.db, session, order, 'order.cancelled');
  });

  const job = await context.db.collection<NotificationJob>('notificationJobs').findOne({ orderId: order._id });
  assert.ok(job);
  assert.equal(Object.hasOwn(job.content, 'total'), false);
});
