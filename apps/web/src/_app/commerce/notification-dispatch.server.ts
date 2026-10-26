import 'server-only';

import { randomUUID } from 'node:crypto';

import { renderNotificationEmail } from '@/_app/emails/index.server';
import { prepareTransactionalEmail, readEmailConfiguration, sendTransactionalEmail } from '@/shared/lib/email/index.server';
import { requireNotificationSchema } from './notification-migration.server';
import { reconcilePendingEmailEvents } from './notification-webhook.server';

import type { Db } from 'mongodb';
import type { NotificationJob } from './notification-types.server';

const leaseMs = 90_000;
const ambiguityLimitMs = 23 * 60 * 60 * 1000;
const maxAttempts = 12;

const retryDelay = (attempts: number, retryAfterMs?: number) => {
  const exponential = Math.min(30 * 60_000, 60_000 * 2 ** Math.min(attempts - 1, 5));
  return Math.max(retryAfterMs ?? 0, exponential + Math.floor(Math.random() * 15_000));
};

const claimJob = async (db: Db, now: Date, environment: NotificationJob['environment']) => {
  const leaseToken = randomUUID();

  const job = await db.collection<NotificationJob>('notificationJobs').findOneAndUpdate({ environment, $or: [
    { status: 'pending', nextAttemptAt: { $lte: now } },
    { status: 'sending', leaseUntil: { $lte: now } },
  ] }, { $set: {
    status: 'sending', leaseToken, leaseUntil: new Date(now.getTime() + leaseMs), updatedAt: now,
  }, $inc: { attempts: 1 } }, { sort: { sourceAt: 1, createdAt: 1 }, returnDocument: 'after' });

  return job;
};

const abandonClaim = async (db: Db, job: NotificationJob, status: NotificationJob['status'], code: string) => {
  await db.collection<NotificationJob>('notificationJobs').updateOne({
    _id: job._id, status: 'sending', leaseToken: job.leaseToken,
  }, { $set: { status, lastErrorCode: code, updatedAt: new Date() },
    $unset: { leaseToken: '', leaseUntil: '' } });
};

const deferClaim = async (db: Db, job: NotificationJob, delay: number) => {
  await db.collection<NotificationJob>('notificationJobs').updateOne({
    _id: job._id, status: 'sending', leaseToken: job.leaseToken,
  }, { $set: { status: 'pending', nextAttemptAt: new Date(Date.now() + delay), updatedAt: new Date() },
    $unset: { leaseToken: '', leaseUntil: '' } });
};

const adminStillEligible = async (db: Db, job: NotificationJob) => {
  if (!job.adminUserId) return job.audience !== 'admin';

  return Boolean(await db.collection('adminUsers').findOne({
    _id: job.adminUserId, status: 'active', 'notify.orders': true, emailNormalized: job.recipient,
  }, { projection: { _id: 1 } }));
};

const eventStillRelevant = async (db: Db, job: NotificationJob) => {
  const order = await db.collection('orders').findOne({ _id: job.orderId }, {
    projection: { orderStatus: 1, fulfillment: 1, payment: 1, cancellation: 1, cancellationRequest: 1 },
  });

  if (!order) return false;

  const payment = order.payment as {
    status?: string; amountPaid?: number; amountRefunded?: number; reconciliationRequired?: boolean; disputed?: boolean;
  } | undefined;

  if (job.type === 'order.paid' || job.type === 'admin.order-paid') {
    const held = Boolean(payment?.reconciliationRequired || payment?.disputed || order.cancellationRequest || order.cancellation);
    return order.orderStatus !== 'cancelled' && payment?.status !== 'refunded' && held === Boolean(job.content.requiresReview);
  }

  if (job.type === 'order.cancelled') {
    return order.orderStatus === 'cancelled' && payment?.amountPaid === job.content.amountPaid &&
      !payment?.reconciliationRequired && !payment?.disputed && (job.content.refundAmount === undefined ||
      (payment?.amountRefunded ?? 0) >= job.content.refundAmount);
  }

  if (job.type === 'refund.succeeded') {
    if (!job.refundId) return false;

    const refund = await db.collection('refunds').findOne({ _id: job.refundId }, { projection: { status: 1 } });
    return refund?.status === 'succeeded';
  }

  if (order.orderStatus === 'cancelled') return false;

  const fulfillment = order.fulfillment as { status?: string } | undefined;

  if (job.type === 'order.processing') return fulfillment?.status === 'processing';

  if (job.type === 'order.shipped') return fulfillment?.status === 'shipped';

  return fulfillment?.status === 'delivered';
};

const frozenPayload = async (db: Db, job: NotificationJob) => {
  if (job.frozen) return job.frozen;

  const rendered = await renderNotificationEmail(job.content);

  const { replyTo, ...prepared } = prepareTransactionalEmail({
    to: job.recipient, subject: rendered.subject, html: rendered.html, text: rendered.text,
    idempotencyKey: job.key, jobId: job._id.toHexString(),
  });

  const frozen = { ...prepared, ...(replyTo ? { replyTo } : {}) };

  const result = await db.collection<NotificationJob>('notificationJobs').updateOne({
    _id: job._id, status: 'sending', leaseToken: job.leaseToken, frozen: { $exists: false },
  }, { $set: { frozen, updatedAt: new Date() } });

  if (!result.modifiedCount) throw new Error('NOTIFICATION_LEASE_LOST');

  return frozen;
};

const sendClaimed = async (db: Db, job: NotificationJob) => {
  const now = new Date();

  if (job.firstRequestAt && now.getTime() - job.firstRequestAt.getTime() >= ambiguityLimitMs) {
    await abandonClaim(db, job, 'unknown', 'IDEMPOTENCY_WINDOW_EXPIRED');
    return 'unknown';
  }

  if (!await adminStillEligible(db, job)) {
    await abandonClaim(db, job, 'suppressed', 'RECIPIENT_INELIGIBLE');
    return 'suppressed';
  }

  if (!await eventStillRelevant(db, job)) {
    await abandonClaim(db, job, 'cancelled', 'EVENT_OBSOLETE');
    return 'cancelled';
  }

  const suppression = await db.collection('emailSuppressions').findOne({
    environment: job.environment, recipientHash: job.recipientHash,
  }, { projection: { _id: 1 } });

  if (suppression) {
    await abandonClaim(db, job, 'suppressed', 'RECIPIENT_SUPPRESSED');
    return 'suppressed';
  }

  const prior = await db.collection<NotificationJob>('notificationJobs').findOne({
    orderId: job.orderId, audience: job.audience, recipient: job.recipient,
    sourceAt: { $lt: job.sourceAt }, status: { $in: ['pending', 'sending'] },
  }, { projection: { _id: 1 } });

  if (prior) {
    await deferClaim(db, job, 60_000);
    return 'deferred';
  }

  let frozen;

  try {
    frozen = await frozenPayload(db, job);
  } catch (error) {
    if ((error as Error).message === 'NOTIFICATION_LEASE_LOST') return 'deferred';

    await abandonClaim(db, job, 'failed', 'EMAIL_RENDER_FAILED');
    return 'failed';
  }

  const recorded = await db.collection<NotificationJob>('notificationJobs').updateOne({
    _id: job._id, status: 'sending', leaseToken: job.leaseToken,
  }, { $set: { firstRequestAt: job.firstRequestAt ?? now, updatedAt: now } });

  if (!recorded.modifiedCount) return 'deferred';

  try {
    const response = await sendTransactionalEmail(frozen);

    const accepted = await db.collection<NotificationJob>('notificationJobs').updateOne({
      _id: job._id, status: 'sending', leaseToken: job.leaseToken,
    }, { $set: { status: 'accepted', providerMessageId: response.id, acceptedAt: new Date(), updatedAt: new Date() },
      $unset: { leaseToken: '', leaseUntil: '', lastErrorCode: '' } });

    if (accepted.modifiedCount) return 'accepted';

    const current = await db.collection<NotificationJob>('notificationJobs').findOne({ _id: job._id });
    return current?.status === 'accepted' ? 'accepted' : 'deferred';
  } catch (error) {
    const delivery = error as { code?: string; retryable?: boolean; ambiguous?: boolean; retryAfterMs?: number };
    const age = Date.now() - (job.firstRequestAt ?? now).getTime();

    const priorAmbiguity = job.outcomeUncertain === true ||
      job.lastErrorCode === 'EMAIL_PROVIDER_OUTCOME_UNKNOWN';

    const unknown = (delivery.ambiguous || priorAmbiguity) && age >= ambiguityLimitMs;
    let status: 'unknown' | 'pending' | 'failed' = 'failed';

    if (unknown || ((delivery.ambiguous || priorAmbiguity) && job.attempts >= maxAttempts)
      || (priorAmbiguity && !delivery.retryable)) status = 'unknown';
    else if (delivery.retryable && job.attempts < maxAttempts) status = 'pending';

    const update = status === 'pending'
      ? { status, nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts, delivery.retryAfterMs)),
        lastErrorCode: delivery.ambiguous || priorAmbiguity ? 'EMAIL_PROVIDER_OUTCOME_UNKNOWN'
          : delivery.code ?? 'EMAIL_SEND_FAILED',
        ...(delivery.ambiguous || priorAmbiguity ? { outcomeUncertain: true } : {}), updatedAt: new Date() }
      : { status, lastErrorCode: status === 'unknown' ? 'EMAIL_PROVIDER_OUTCOME_UNKNOWN'
        : delivery.code ?? 'EMAIL_SEND_FAILED',
      ...(delivery.ambiguous || priorAmbiguity ? { outcomeUncertain: true } : {}), updatedAt: new Date() };

    const clearRequestTime = !delivery.ambiguous && !priorAmbiguity;

    const updated = await db.collection<NotificationJob>('notificationJobs').updateOne({
      _id: job._id, status: 'sending', leaseToken: job.leaseToken,
    }, { $set: update, $unset: { leaseToken: '', leaseUntil: '',
      ...(clearRequestTime ? { firstRequestAt: '' } : {}) } });

    if (!updated.modifiedCount) {
      const current = await db.collection<NotificationJob>('notificationJobs').findOne({ _id: job._id });
      return current?.status === 'accepted' ? 'accepted' : 'deferred';
    }

    return status;
  }
};

export const dispatchNotificationBatch = async (db: Db, limit = 10) => {
  const config = readEmailConfiguration();
  const result = { claimed: 0, accepted: 0, failed: 0, unknown: 0 };

  if (!config.enabled) return result;

  await requireNotificationSchema(db);
  await reconcilePendingEmailEvents(db);

  for (let index = 0; index < Math.min(limit, 20); index += 1) {
    const job = await claimJob(db, new Date(), config.environment === 'production' ? 'production' : 'stage');

    if (!job) break;

    result.claimed += 1;
    const status = await sendClaimed(db, job);

    if (status === 'accepted') result.accepted += 1;

    if (status === 'failed') result.failed += 1;

    if (status === 'unknown') result.unknown += 1;
  }

  return result;
};
