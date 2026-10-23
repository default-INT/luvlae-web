import 'server-only';

import { ObjectId } from 'mongodb';

import { readEmailConfiguration } from '@/shared/lib/email/index.server';
import { hashToken } from '@/shared/lib/security/index.server';

import { requireNotificationSchema } from './notification-migration.server';

import type { NotificationContent } from '@/_app/emails/index.server';
import type { ClientSession, Db } from 'mongodb';
import type { Order } from './models';
import type { NotificationJob, NotificationType } from './notification-types.server';

const contentFromOrder = (order: Order, type: NotificationType, refundAmount?: number): NotificationContent => {
  const config = readEmailConfiguration();

  const content: NotificationContent = {
    type,
    orderNumber: order.orderNumber,
    ...(order.customer ? { customerName: order.customer.name } : {}),
    items: order.items.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitAmount: item.unitAmount,
      lineSubtotal: item.lineSubtotal,
    })),
    currency: order.currency,
    ...(order.pricing.total === null ? {} : { total: order.pricing.total }),
    amountPaid: order.payment.amountPaid,
    requiresReview: order.payment.reconciliationRequired || order.payment.disputed ||
      Boolean(order.cancellationRequest || order.cancellation),
  };

  if (order.fulfillment.carrier) content.carrier = order.fulfillment.carrier;

  if (order.fulfillment.trackingNumber) content.trackingNumber = order.fulfillment.trackingNumber;

  if (refundAmount !== undefined) content.refundAmount = refundAmount;

  if (config.replyTo) content.supportEmail = config.replyTo;

  if (type === 'admin.order-paid' && config.appOrigin) {
    content.adminUrl = `${config.appOrigin}/admin/orders?order=${order._id.toHexString()}`;
  }

  return content;
};

const sourceTime = (order: Order, type: NotificationType, now: Date) => {
  if (type === 'order.paid' || type === 'admin.order-paid') return order.payment.paidAt ?? now;

  if (type === 'order.processing') return order.fulfillment.processingAt ?? now;

  if (type === 'order.shipped') return order.fulfillment.shippedAt ?? now;

  if (type === 'order.delivered') return order.fulfillment.deliveredAt ?? now;

  if (type === 'order.cancelled') return order.cancellation?.cancelledAt ?? now;

  return now;
};

const validRecipient = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const enqueueOrderNotification = async (
  db: Db, session: ClientSession, order: Order, type: NotificationType, eventKey: string = type, refundAmount?: number,
) => {
  const config = readEmailConfiguration();

  if (!config.enabled) return;

  await requireNotificationSchema(db, session);

  const audience = type === 'admin.order-paid' ? 'admin' : 'buyer';
  const recipients: { email: string; _id?: ObjectId }[] = [];

  if (audience === 'admin') {
    recipients.push(...await db.collection<{ _id: ObjectId; email: string }>('adminUsers')
      .find({ status: 'active', 'notify.orders': true }, { session, projection: { _id: 1, email: 1 } }).toArray());
  } else if (order.customer?.email) {
    recipients.push({ email: order.customer.email });
  }

  const now = new Date();
  const content = contentFromOrder(order, type, refundAmount);

  for (const recipient of recipients) {
    const email = recipient.email.trim().toLowerCase();

    if (!validRecipient(email)) continue;

    const identity = '_id' in recipient && recipient._id ? recipient._id.toHexString() : hashToken(email);
    const environment = config.environment === 'production' ? 'production' : 'stage';
    const key = hashToken([environment, order._id.toHexString(), eventKey, audience, identity].join(':'));
    const destination = environment === 'stage' ? config.stageRecipient! : email;
    const recipientHash = hashToken(destination.toLowerCase());

    const job: NotificationJob = {
      _id: new ObjectId(), schemaVersion: 1, templateVersion: '1', locale: 'en', key, environment,
      orderId: order._id, type, eventKey, audience, recipient: email, recipientHash,
      content, sourceAt: sourceTime(order, type, now), createdAt: now, updatedAt: now,
      status: 'pending', delivery: 'unconfirmed', attempts: 0, nextAttemptAt: now,
    };

    if ('_id' in recipient && recipient._id) job.adminUserId = recipient._id;

    if (type === 'refund.succeeded') {
      const refund = await db.collection('refunds').findOne({
        orderId: order._id, $or: [
          ...(ObjectId.isValid(eventKey) ? [{ _id: new ObjectId(eventKey) }] : []),
          { operationId: eventKey }, { providerRefundId: eventKey },
        ],
      }, { session, projection: { _id: 1 } });

      if (refund) job.refundId = refund._id;
    }

    await db.collection<NotificationJob>('notificationJobs').updateOne({ key }, { $setOnInsert: job }, { upsert: true, session });
  }

  if (['order.shipped', 'order.delivered', 'order.cancelled'].includes(type)) {
    const obsolete: NotificationType[] = ['order.processing'];

    if (type !== 'order.shipped') obsolete.push('order.shipped');

    if (type === 'order.cancelled') obsolete.push('order.delivered');

    await db.collection<NotificationJob>('notificationJobs').updateMany({
      orderId: order._id, type: { $in: obsolete }, status: 'pending',
    }, { $set: { status: 'cancelled', updatedAt: now, lastErrorCode: 'EVENT_OBSOLETE' } }, { session });
  }
};

export const listNotificationJobs = async (db: Db, orderId: ObjectId) => {
  const jobs = await db.collection<NotificationJob>('notificationJobs')
    .find({ orderId }, { projection: { content: 0, frozen: 0, recipient: 0, recipientHash: 0, key: 0 } })
    .sort({ sourceAt: -1, createdAt: -1 }).limit(100).toArray();

  return jobs.map(job => ({
    id: job._id.toHexString(), type: job.type, audience: job.audience, status: job.status,
    delivery: job.delivery, attempts: job.attempts, createdAt: job.createdAt,
    acceptedAt: job.acceptedAt, lastErrorCode: job.lastErrorCode,
  }));
};

export const retryNotificationJob = async (
  db: Db, session: ClientSession, jobId: ObjectId, adminId: ObjectId, operationId?: string,
) => {
  const jobs = db.collection<NotificationJob>('notificationJobs');
  const now = new Date();

  const auditOperationId = operationId ? `notification-retry:${operationId}` :
    `notification-retry:${jobId.toHexString()}:${now.getTime()}`;

  const existing = await db.collection('auditLog').findOne({ operationId: auditOperationId }, { session });

  if (existing) return existing.changes?.jobId === jobId.toHexString();

  const job = await jobs.findOne({ _id: jobId }, { session });

  if (!job) return false;

  const redelivery = job.status === 'accepted' && job.delivery === 'failed';

  if (!redelivery && (job.status !== 'failed' || job.acceptedAt ||
    (job.firstRequestAt && now.getTime() - job.firstRequestAt.getTime() >= 23 * 60 * 60 * 1000))) return false;

  const suppressed = await db.collection('emailSuppressions').findOne({
    environment: job.environment, recipientHash: job.recipientHash,
  }, { session });

  if (suppressed) return false;

  if (redelivery) {
    const originalId = job.retryOf ?? job._id;
    const touched = await jobs.updateOne({ _id: originalId }, { $currentDate: { updatedAt: true } }, { session });

    if (!touched.modifiedCount) return false;

    const activeChild = await jobs.findOne({ retryOf: originalId, $or: [
      { status: { $in: ['pending', 'sending', 'unknown'] } },
      { status: 'accepted', delivery: { $ne: 'failed' } },
    ] }, { session, projection: { _id: 1 } });

    if (activeChild) return false;

    const child: NotificationJob = {
      ...job, _id: new ObjectId(), retryOf: originalId,
      key: hashToken(`${job.key}:redelivery:${operationId ?? now.toISOString()}`),
      status: 'pending', delivery: 'unconfirmed', attempts: 0, nextAttemptAt: now,
      createdAt: now, updatedAt: now,
    };

    delete child.frozen;
    delete child.firstRequestAt;
    delete child.outcomeUncertain;
    delete child.providerMessageId;
    delete child.acceptedAt;
    delete child.lastErrorCode;
    delete child.lastEventAt;
    delete child.leaseToken;
    delete child.leaseUntil;
    await jobs.insertOne(child, { session });
  } else {
    const result = await jobs.updateOne({ _id: jobId, status: 'failed' }, {
      $set: { status: 'pending', nextAttemptAt: now, updatedAt: now }, $unset: { lastErrorCode: '' },
    }, { session });

    if (!result.modifiedCount) return false;
  }

  await db.collection('auditLog').insertOne({
    _id: new ObjectId(), schemaVersion: 1, operationId: auditOperationId,
    requestHash: hashToken(jobId.toHexString()), actor: { type: 'admin', id: adminId },
    entityType: 'order', entityId: job.orderId, action: 'notification.retry', changes: { jobId: jobId.toHexString() },
    createdAt: now,
  }, { session });

  return true;
};

export const suppressInvalidRefundNotifications = async (
  db: Db, session: ClientSession, orderId: ObjectId, eventKey: string,
) => db.collection<NotificationJob>('notificationJobs').updateMany({
  orderId, type: 'refund.succeeded', eventKey, status: { $in: ['pending', 'failed'] },
}, { $set: { status: 'cancelled', lastErrorCode: 'REFUND_REVERSED', updatedAt: new Date() } }, { session });
