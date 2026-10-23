import 'server-only';

import { ObjectId } from 'mongodb';
import Stripe from 'stripe';

import { ApiError, fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { createStripeClient, matchesStripeMode } from '@/shared/lib/stripe/index.server';

import { appendAudit, checkReplay, requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { requireRefundSchema } from './refund-migration.server';
import { finishCancellation } from './refund-persistence.server';
import { executeProviderRefund, reconcileUnpaidCancellation } from './refund-provider.server';
import { enqueueOrderNotification } from './notifications.server';

import type { z } from 'zod';
import type { cancellationSchema } from './contracts';
import type { Refund } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

type Input = z.infer<typeof cancellationSchema>;
const activeStatuses = ['requested', 'unknown', 'pending'];

const startOperation = async (
  context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: Input, kind: Refund['kind'],
) => inTransaction(context, async session => {
  await requireRefundSchema(context.db, session);
  const { orders, attempts, refunds } = collections(context.db);

  // Version is an admission check, not part of an operation's immutable semantic identity.
  const requestHash = requestFingerprint({ action: `order.${kind}`,
    id: orderId.toHexString(), reason: input.reason });

  const previous = await refunds.findOne({ operationId: input.operationId }, { session });

  if (previous) {
    if (previous.requestHash !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT', 'The operation ID belongs to another request.');

    return { request: previous, replayed: true };
  }

  await checkReplay(context.db, session, input.operationId, requestHash);
  const order = await orders.findOne({ _id: orderId }, { session });

  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');

  if (order.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the order before editing.');

  if (order.payment.disputed || order.payment.reconciliationRequired) {
    fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Resolve the payment hold before this operation.');
  }

  if (await refunds.findOne({ orderId, active: true, source: { $in: ['admin', 'mock'] } }, { session })) {
    fail(409, 'REFUND_IN_PROGRESS', 'An existing operation must be reconciled first.');
  }

  const cancel = kind === 'cancel';

  const eligible = cancel
    ? order.orderStatus === 'open' && ['unfulfilled', 'processing'].includes(order.fulfillment.status)
    : (['shipped', 'delivered'].includes(order.fulfillment.status) || order.orderStatus === 'cancelled')
      && !order.payment.activeAttemptId;

  const amount = order.payment.amountPaid - order.payment.amountRefunded;

  if (!eligible || (!cancel && amount <= 0)) fail(409, 'INVALID_TRANSITION', 'The order is not eligible for this operation.');

  const attemptId = order.payment.settledAttemptId;
  const attempt = attemptId ? await attempts.findOne({ _id: attemptId, orderId }, { session }) : null;
  const mock = order.checkoutMode === 'mock';

  if (amount > 0 && !mock && (!attempt?.stripePaymentIntentId || !matchesStripeMode(attempt.livemode))) {
    fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Associate the settled Stripe payment before refunding.');
  }

  const now = new Date();

  const request: Refund = {
    _id: new ObjectId(), schemaVersion: 1, orderId, operationId: input.operationId, requestHash,
    requestedVersion: input.version, stripeApiVersion: Stripe.API_VERSION,
    source: mock ? 'mock' : 'admin', kind, amount, currency: 'USD',
    status: 'requested', active: true, reason: input.reason, adminId,
    livemode: attempt?.livemode ?? false, createdAt: now, updatedAt: now,
    ...(attemptId ? { attemptId } : {}),
    ...(attempt?.stripePaymentIntentId ? { stripePaymentIntentId: attempt.stripePaymentIntentId } : {}),
  };

  await refunds.insertOne(request, { session });
  await orders.updateOne({ _id: orderId, version: input.version }, {
    $set: { updatedAt: now, ...(cancel ? { cancellationRequest: {
      status: 'pending' as const, reason: input.reason, operationId: input.operationId, adminId,
    } } : {}) }, $inc: { version: 1 },
  }, { session });
  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'order', entityId: orderId, action: `order.${kind}.requested`, reason: input.reason,
    changes: { amount, currency: 'USD', source: request.source },
  });
  return { request, replayed: false };
});

const finishLocalOperation = async (context: DatabaseContext, request: Refund) => inTransaction(context, async session => {
  const { orders, refunds } = collections(context.db);
  const fresh = await refunds.findOne({ _id: request._id }, { session });

  if (!fresh || !activeStatuses.includes(fresh.status)) return;

  const order = await orders.findOne({ _id: request.orderId }, { session });

  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');

  if (order.payment.activeAttemptId) fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'The active payment requires reconciliation.');

  const amountRefunded = request.source === 'mock' ? order.payment.amountPaid : order.payment.amountRefunded;

  if (request.source !== 'mock' && amountRefunded < order.payment.amountPaid) {
    fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'A completed payment must be refunded first.');
  }

  const now = new Date();
  await refunds.updateOne({ _id: request._id }, { $set: { status: 'succeeded', active: false, updatedAt: now } }, { session });
  await orders.updateOne({ _id: order._id }, {
    $set: { 'payment.amountRefunded': amountRefunded,
      ...(amountRefunded > 0 ? { 'payment.status': 'refunded' as const } : {}), updatedAt: now },
    $inc: { version: 1 },
  }, { session });

  if (request.kind === 'cancel') {
    await finishCancellation(context.db, session, { ...order, payment: { ...order.payment, amountRefunded } });
  }

  if (request.source === 'mock' && request.kind === 'refund') {
    await enqueueOrderNotification(context.db, session, { ...order, payment: { ...order.payment, amountRefunded } },
      'refund.succeeded', request.operationId, request.amount);
  }
});

export const resumeRefundOperation = async (context: DatabaseContext, initialRequest: Refund, stripe?: Stripe) => {
  await requireRefundSchema(context.db);

  if (!activeStatuses.includes(initialRequest.status)) return;

  const leaseToken = new ObjectId().toHexString();
  const requestStore = collections(context.db).refunds;

  const claimed = await requestStore.findOneAndUpdate({
    _id: initialRequest._id, active: true,
    $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: new Date() } }],
  }, { $set: { leaseToken, leaseUntil: new Date(Date.now() + 120000) } }, { returnDocument: 'after' });

  if (!claimed) return;

  let request = claimed;

  try {
    if (request.source === 'mock') return await finishLocalOperation(context, request);

    const current = await collections(context.db).orders.findOne({ _id: request.orderId });

    if (request.amount === 0 && !current?.payment.activeAttemptId
      && current?.payment.amountPaid === 0) {
      return await finishLocalOperation(context, request);
    }

    const provider = stripe ?? createStripeClient();

    if (request.kind === 'cancel') await reconcileUnpaidCancellation(context, request, provider);

    // An unpaid cancellation may race successful settlement. Bind the now-settled payment before its first refund call.
    if (request.amount === 0) {
      const order = await collections(context.db).orders.findOne({ _id: request.orderId });

      const attempt = order?.payment.settledAttemptId
        ? await collections(context.db).attempts.findOne({ _id: order.payment.settledAttemptId }) : null;

      const amount = order ? order.payment.amountPaid - order.payment.amountRefunded : 0;

      if (order && order.payment.amountPaid > 0 && attempt?.stripePaymentIntentId) {
        await collections(context.db).refunds.updateOne({ _id: request._id, amount: 0 }, { $set: {
          amount, attemptId: attempt._id, stripePaymentIntentId: attempt.stripePaymentIntentId, livemode: attempt.livemode,
        } });
        request = { ...request, amount, attemptId: attempt._id, stripePaymentIntentId: attempt.stripePaymentIntentId,
          livemode: attempt.livemode };
      } else if (order?.payment.amountPaid === 0) return await finishLocalOperation(context, request);
      else return fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Associate the settled payment before cancellation.');
    }

    const reconciled = await executeProviderRefund(context, request, provider);

    if (reconciled) await finishLocalOperation(context, reconciled);
  } catch (error) {
    // Unknown means no financial conclusion: retain the request and the cancellation hold for safe recovery.
    await collections(context.db).refunds.updateOne({ _id: request._id, leaseToken,
      status: { $in: ['requested', 'unknown'] } }, {
      $set: { status: 'unknown', active: true,
        failureReason: error instanceof ApiError ? error.code : 'PROVIDER_RESULT_UNKNOWN', updatedAt: new Date() },
    });
    throw error;
  } finally {
    await requestStore.updateOne({ _id: request._id, leaseToken }, { $unset: { leaseUntil: '', leaseToken: '' } });
  }
};

const mutate = async (context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: Input, kind: Refund['kind'],
  stripe?: Stripe) => {
  const { request, replayed } = await startOperation(context, adminId, orderId, input, kind);
  await resumeRefundOperation(context, request, stripe);
  const latest = await collections(context.db).refunds.findOne({ _id: request._id });
  return { id: orderId.toHexString(), replayed, status: latest?.status ?? request.status };
};

export const cancelOrder = (context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: Input, stripe?: Stripe) =>
  mutate(context, adminId, orderId, input, 'cancel', stripe);

export const refundOrder = (context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: Input, stripe?: Stripe) =>
  mutate(context, adminId, orderId, input, 'refund', stripe);
