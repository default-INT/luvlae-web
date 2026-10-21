import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { matchesStripeMode } from '@/shared/lib/stripe/index.server';

import { appendAudit } from './audit.server';
import { collections } from './collections.server';
import { requireRefundSchema } from './refund-migration.server';
import { appendPaymentTransaction } from './payments.server';

import type { ClientSession, Db } from 'mongodb';
import type Stripe from 'stripe';
import type { Order, Refund } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const finishCancellation = async (db: Db, session: ClientSession, order: Order) => {
  const request = order.cancellationRequest;

  if (!request || request.status === 'succeeded') return;

  if (order.payment.activeAttemptId || order.payment.amountRefunded < order.payment.amountPaid
    || order.payment.disputed || order.payment.reconciliationRequired
    || !['unfulfilled', 'processing'].includes(order.fulfillment.status)) {
    fail(409, 'CANCELLATION_BLOCKED', 'The cancellation requires payment reconciliation.');
  }

  const now = new Date();
  const restocked = { ...order.restockedQuantities };

  // Only committed units were deducted from stock; an unpaid released reservation must not add stock.
  const settled = order.payment.settledAttemptId
    ? await collections(db).attempts.findOne({ _id: order.payment.settledAttemptId, orderId: order._id }, { session }) : null;

  if (order.payment.amountPaid > 0 && settled?.inventoryReservation.state !== 'committed') {
    fail(409, 'CANCELLATION_BLOCKED', 'The paid inventory requires reconciliation.');
  }

  if (settled) {
    for (const item of order.items) {
      const quantity = item.quantity - (restocked[item.sku] ?? 0);

      if (quantity <= 0) continue;

      const result = await collections(db).products.updateOne({ _id: item.productId }, {
        $inc: { 'inventory.stockQuantity': quantity, version: 1 }, $set: { updatedAt: now, updatedBy: request.adminId },
      }, { session });

      if (!result.matchedCount) fail(409, 'PRODUCT_UNAVAILABLE', 'The referenced product does not exist.');

      restocked[item.sku] = item.quantity;
    }
  }

  await collections(db).orders.updateOne({ _id: order._id }, {
    $set: {
      orderStatus: 'cancelled', 'fulfillment.status': 'cancelled',
      'cancellationRequest.status': 'succeeded',
      cancellation: { reason: request.reason, cancelledAt: now, cancelledBy: request.adminId },
      restockedQuantities: restocked, updatedAt: now,
    }, $inc: { version: 1 },
  }, { session });
  await appendAudit(db, session, {
    operationId: `cancel-complete:${request.operationId}`, requestHash: request.operationId,
    actor: { type: 'system' }, entityType: 'order', entityId: order._id,
    action: 'order.cancel.completed', reason: request.reason, changes: { restockedQuantities: restocked },
  });
};

const objectId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id;

const providerStatus = (status: Stripe.Refund['status']): Refund['status'] => {
  const states: Record<string, Refund['status']> = { succeeded: 'succeeded', failed: 'failed', canceled: 'cancelled' };
  return states[status ?? ''] ?? 'pending';
};

const effectiveStatus = (local: Refund | null, mapped: Refund['status']) => {
  if (local?.status === 'succeeded' && mapped === 'failed') return 'failed';

  if (local && ['succeeded', 'failed', 'cancelled'].includes(local.status)) return local.status;

  return mapped;
};

const paymentStatus = (total: number, paid: number): Order['payment']['status'] => {
  if (total === paid) return 'refunded';

  return total > 0 ? 'partially_refunded' : 'paid';
};

export const applyProviderRefund = async (
  context: DatabaseContext, provider: Stripe.Refund, event?: Stripe.Event,
) => inTransaction(context, async session => {
  const { db } = context;
  await requireRefundSchema(db, session);
  const { orders, attempts, refunds, events } = collections(db);

  if (event && event.type !== 'charge.refunded' && await events.findOne({ eventId: event.id, status: 'processed' },
    { session })) {
    return { ignored: false };
  }

  const intentId = objectId(provider.payment_intent);

  if (!intentId && !provider.metadata?.orderId && !provider.metadata?.operationId) return { ignored: true };

  if (!intentId || provider.currency !== 'usd'
    || !Number.isSafeInteger(provider.amount) || provider.amount <= 0) {
    fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'Refund environment, currency or amount does not match.');
  }

  const attempt = await attempts.findOne({ stripePaymentIntentId: intentId }, { session });

  if (!attempt) {
    if (provider.metadata?.orderId || provider.metadata?.operationId) {
      fail(503, 'REFUND_NOT_READY', 'The refund payment association is not ready.');
    }

    return { ignored: true };
  }

  const order = await orders.findOne({ _id: attempt.orderId }, { session });

  if (!order || order.checkoutMode === 'mock' || !order.payment.settledAttemptId?.equals(attempt._id)
    || !matchesStripeMode(attempt.livemode) || (event && event.livemode !== attempt.livemode)
    || provider.amount > order.payment.amountPaid) {
    return fail(503, 'REFUND_NOT_READY', 'The settled payment association is not ready.');
  }

  const local = await refunds.findOne({ providerRefundId: provider.id }, { session })
    ?? (provider.metadata?.operationId
      ? await refunds.findOne({ operationId: provider.metadata.operationId }, { session }) : null);

  if (local && (!local.orderId.equals(order._id) || local.amount !== provider.amount
    || local.stripePaymentIntentId !== intentId || local.livemode !== attempt.livemode
    || (local.providerRefundId && local.providerRefundId !== provider.id))) {
    fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The refund does not match the saved request.');
  }

  if (local?.source === 'admin' && !local.providerRefundId && (provider.metadata?.orderId !== order._id.toHexString()
    || provider.metadata?.operationId !== local.operationId)) {
    fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The refund metadata does not match the saved request.');
  }

  const mapped = providerStatus(provider.status);
  const status = effectiveStatus(local, mapped);
  const now = new Date();

  const record: Refund = {
    ...(local ?? {
      _id: new ObjectId(), schemaVersion: 1, orderId: order._id, attemptId: attempt._id,
      operationId: `stripe:${provider.id}`, requestHash: provider.id, requestedVersion: order.version,
      source: 'stripe' as const, kind: 'refund' as const, currency: 'USD' as const,
      amount: provider.amount, livemode: attempt.livemode, createdAt: new Date(provider.created * 1000),
    }),
    status, active: status === 'pending', updatedAt: now,
    providerRefundId: provider.id, stripePaymentIntentId: intentId, providerStatus: provider.status ?? 'unknown',
    ...(provider.reason ? { providerReason: provider.reason } : {}),
    ...(provider.failure_reason ? { failureReason: provider.failure_reason } : {}),
  };

  await refunds.replaceOne({ _id: record._id }, record, { upsert: true, session });

  const successful = await refunds.aggregate<{ total: number }>([
    { $match: { orderId: order._id, status: 'succeeded' } }, { $group: { _id: null, total: { $sum: '$amount' } } },
  ], { session }).next();

  const total = successful?.total ?? 0;

  if (!Number.isSafeInteger(total) || total > order.payment.amountPaid) {
    fail(409, 'PAYMENT_AMOUNT_MISMATCH', 'The refund total exceeds the settled payment.');
  }

  // Concurrent observations touch the aggregate, forcing transaction retries and a fresh sum.
  await orders.updateOne({ _id: order._id }, {
    $set: { 'payment.amountRefunded': total, updatedAt: now,
      'payment.status': paymentStatus(total, order.payment.amountPaid),
      ...(status === 'failed' && local?.status === 'succeeded' ? { 'payment.reconciliationRequired': true } : {}) },
    $inc: { version: 1 },
  }, { session });

  if (event) {
    await events.updateOne({ eventId: event.id, provider: 'stripe' }, {
      $set: { orderId: order._id, attemptId: attempt._id },
    }, { session });
    await appendPaymentTransaction(db, session, {
      operationId: `refund:${event.id}:${provider.id}:${mapped}`, orderId: order._id, attemptId: attempt._id,
      provider: 'stripe', providerObjectId: provider.id, providerEventId: event.id, type: 'refund',
      status: mapped as 'pending' | 'cancelled' | 'succeeded' | 'failed',
      amount: provider.amount, currency: 'USD', livemode: attempt.livemode,
      occurredAt: new Date(event.created * 1000),
    });
  }

  // An external refund changes financial state only. Only the matching local cancellation may restock.
  if (record.kind === 'cancel' && record.source === 'admin' && status === 'succeeded'
    && order.cancellationRequest?.operationId === record.operationId) {
    await finishCancellation(db, session, { ...order, payment: { ...order.payment, amountRefunded: total } });
  }

  if (event && event.type !== 'charge.refunded') {
    await events.updateOne({ eventId: event.id }, { $set: { status: 'processed', processedAt: now },
      $unset: { lastErrorCode: '' } }, { session });
  }

  return { ignored: false, status };
});
