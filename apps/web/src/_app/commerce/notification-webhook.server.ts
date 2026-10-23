import 'server-only';

import { ObjectId } from 'mongodb';

import { withDatabase } from '@/shared/lib/mongodb/index.server';
import { readEmailConfiguration, verifyResendWebhook } from '@/shared/lib/email/index.server';

import { requireNotificationSchema } from './notification-migration.server';

import type { Db } from 'mongodb';
import type { NotificationEvent, NotificationJob, NotificationDeliveryState } from './notification-types.server';

const maxBodyBytes = 64 * 1024;

const known = new Set(['email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
  'email.complained', 'email.failed']);

const readBoundedRequest = async (request: Request) => {
  const declared = Number(request.headers.get('content-length'));

  if (declared > maxBodyBytes) return undefined;

  const reader = request.body?.getReader();

  if (!reader) return undefined;

  const chunks: Uint8Array[] = [];
  let length = 0;

  for (;;) {
    const { value, done } = await reader.read();

    if (done) break;

    length += value.byteLength;

    if (length > maxBodyBytes) {
      await reader.cancel();
      return undefined;
    }

    chunks.push(value);
  }

  const body = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new Request(request.url, { method: 'POST', headers: request.headers, body });
};

const tagJobId = (tags: unknown) => {
  if (Array.isArray(tags)) {
    const tag = tags.find(value => value && typeof value === 'object' && value.name === 'job');
    return typeof tag?.value === 'string' ? tag.value : undefined;
  }

  if (tags && typeof tags === 'object' && 'job' in tags && typeof tags.job === 'string') return tags.job;

  return undefined;
};

const deliveryState = (type: string): NotificationDeliveryState | undefined => {
  if (type === 'email.delivered') return 'delivered';

  if (type === 'email.delivery_delayed') return 'delayed';

  if (type === 'email.bounced') return 'bounced';

  if (type === 'email.complained') return 'complained';

  if (type === 'email.failed') return 'failed';

  return undefined;
};

const shouldApply = (current: NotificationDeliveryState, next: NotificationDeliveryState) => {
  if (current === 'complained') return false;

  if (next === 'complained') return true;

  if (current === 'bounced') return false;

  if (next === 'bounced') return true;

  if (current === 'delivered') return false;

  if (next === 'delivered') return true;

  if (current === 'failed') return false;

  if (next === 'failed') return true;

  return current === 'unconfirmed';
};

const ignoreEvent = async (db: Db, eventId: ObjectId) => {
  await db.collection<NotificationEvent>('emailEvents').updateOne({ _id: eventId, status: 'pending' }, {
    $set: { status: 'ignored' },
  });
};

const applyEvent = async (db: Db, event: NotificationEvent) => {
  const jobs = db.collection<NotificationJob>('notificationJobs');

  const byProvider = event.providerMessageId
    ? await jobs.findOne({ providerMessageId: event.providerMessageId }) : null;

  const byTag = event.jobId ? await jobs.findOne({ _id: event.jobId }) : null;
  const job = byProvider ?? byTag;

  if (event.jobId && !byTag) {
    await ignoreEvent(db, event._id);
    return false;
  }

  if ((byProvider && byTag && !byProvider._id.equals(byTag._id))
    || (job?.providerMessageId && job.providerMessageId !== event.providerMessageId)) {
    await ignoreEvent(db, event._id);
    return false;
  }

  if (!job || !job.firstRequestAt || !job.frozen) return false;

  const environment = readEmailConfiguration().environment === 'production' ? 'production' : 'stage';

  if (job.environment !== environment) {
    await ignoreEvent(db, event._id);
    return false;
  }

  const next = deliveryState(event.type);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = attempt === 0 ? job : await jobs.findOne({ _id: job._id });

    if (!current) return false;

    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (next && shouldApply(current.delivery, next)) update.delivery = next;

    if (event.providerMessageId && !current.providerMessageId) update.providerMessageId = event.providerMessageId;

    if (current.status !== 'accepted') {
      update.status = 'accepted';
      update.acceptedAt = event.occurredAt;
    }

    const applied = await jobs.updateOne({ _id: job._id, delivery: current.delivery,
      ...(current.providerMessageId ? { providerMessageId: current.providerMessageId }
        : { providerMessageId: { $exists: false } }), status: current.status }, {
      $set: update, $max: { lastEventAt: event.occurredAt },
      ...(current.status === 'sending' ? { $unset: { leaseToken: '', leaseUntil: '' } } : {}),
    });

    if (applied.modifiedCount) break;

    if (attempt === 3) return false;
  }

  if (next === 'bounced' || next === 'complained') {
    const now = new Date();
    await db.collection('emailSuppressions').updateOne({
      environment: job.environment, recipientHash: job.recipientHash,
    }, { $set: { reason: next, updatedAt: now }, $setOnInsert: {
      _id: new ObjectId(), schemaVersion: 1, environment: job.environment,
      recipientHash: job.recipientHash, createdAt: now,
    } }, { upsert: true });

    await jobs.updateMany({
      environment: job.environment, recipientHash: job.recipientHash, status: 'pending',
    }, { $set: { status: 'suppressed', lastErrorCode: 'RECIPIENT_SUPPRESSED', updatedAt: now } });
  }

  await db.collection<NotificationEvent>('emailEvents').updateOne({ _id: event._id }, {
    $set: { status: 'applied', jobId: job._id },
  });

  return true;
};

const receiveEvent = async (db: Db, verified: {
  id: string; type: string; created_at: string; data: Record<string, unknown>;
}) => {
  const now = new Date();
  const providerMessageId = typeof verified.data.email_id === 'string' ? verified.data.email_id : undefined;
  const tag = tagJobId(verified.data.tags);
  const jobId = tag && ObjectId.isValid(tag) ? new ObjectId(tag) : undefined;

  const hasJobTag = Array.isArray(verified.data.tags)
    ? verified.data.tags.some(value => value && typeof value === 'object' && value.name === 'job')
    : Boolean(verified.data.tags && typeof verified.data.tags === 'object' && 'job' in verified.data.tags);

  const malformedTag = hasJobTag && !jobId;
  const occurredAt = new Date(verified.created_at);

  if (!verified.id || !known.has(verified.type) || Number.isNaN(occurredAt.getTime())) return;

  await db.collection<NotificationEvent>('emailEvents').updateOne({ provider: 'resend', eventId: verified.id }, {
    $setOnInsert: {
      _id: new ObjectId(), schemaVersion: 1, provider: 'resend', eventId: verified.id,
      type: verified.type, ...(providerMessageId ? { providerMessageId } : {}),
      ...(jobId ? { jobId } : {}),
      occurredAt, receivedAt: now, status: malformedTag ? 'ignored' : 'pending',
    },
  }, { upsert: true });

  const event = await db.collection<NotificationEvent>('emailEvents').findOne({
    provider: 'resend', eventId: verified.id,
  });

  if (!event || event.status !== 'pending') return;

  await applyEvent(db, event);
};

export const resendWebhook = async (request: Request) => {
  const bounded = await readBoundedRequest(request);

  if (!bounded) return Response.json({ error: 'PAYLOAD_TOO_LARGE' }, { status: 413 });

  let verified;

  try {
    verified = await verifyResendWebhook(bounded);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return Response.json({ error: code === 'EMAIL_WEBHOOK_NOT_CONFIGURED' ? code : 'EMAIL_WEBHOOK_INVALID' }, {
      status: code === 'EMAIL_WEBHOOK_NOT_CONFIGURED' ? 503 : 400,
    });
  }

  try {
    await withDatabase(async ({ db }) => {
      await requireNotificationSchema(db);
      await receiveEvent(db, verified);
    });

    return Response.json({ received: true });
  } catch {
    return Response.json({ error: 'WEBHOOK_STORE_UNAVAILABLE' }, { status: 503 });
  }
};

export const reconcilePendingEmailEvents = async (db: Db, limit = 20) => {
  const inbox = db.collection<NotificationEvent>('emailEvents');

  const events = await inbox.find({ status: 'pending' })
    .sort({ lastAttemptAt: 1, receivedAt: 1 }).limit(limit).toArray();

  for (const event of events) {
    if (!await applyEvent(db, event)) {
      await inbox.updateOne({ _id: event._id, status: 'pending' }, { $set: { lastAttemptAt: new Date() } });
    }
  }

  return events.length;
};
