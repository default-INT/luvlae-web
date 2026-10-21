import 'server-only';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit, requestFingerprint } from './audit.server';
import { collections } from './collections.server';

import type { Refund } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

// Only an unsubmitted request can adopt a smaller amount discovered through provider reconciliation.
export const reconcileRefundRequestAmount = (context: DatabaseContext, request: Refund) =>
  inTransaction(context, async session => {
    const { refunds, orders } = collections(context.db);
    const fresh = await refunds.findOne({ _id: request._id }, { session });
    const order = await orders.findOne({ _id: request.orderId }, { session });

    if (!fresh || !order) return fail(404, 'NOT_FOUND', 'Refund request or order not found.');

    if (fresh.providerRequestStartedAt || fresh.providerRefundId || !fresh.active) return fresh;

    if (fresh.leaseToken !== request.leaseToken) {
      return fail(409, 'REFUND_IN_PROGRESS', 'Another process is reconciling this request.');
    }

    if (order.payment.disputed || order.payment.reconciliationRequired) {
      return fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Resolve the payment hold before refunding.');
    }

    const pending = await refunds.findOne({ orderId: order._id, source: 'stripe', active: true }, { session });
    const amount = order.payment.amountPaid - order.payment.amountRefunded;

    if (pending || amount >= fresh.amount) return fresh;

    if (!Number.isSafeInteger(amount) || amount < 0) {
      return fail(409, 'PAYMENT_AMOUNT_MISMATCH', 'The remaining refund amount is invalid.');
    }

    const now = new Date();
    await refunds.updateOne({ _id: fresh._id }, { $set: { amount, updatedAt: now } }, { session });
    await orders.updateOne({ _id: order._id }, { $set: { updatedAt: now }, $inc: { version: 1 } }, { session });
    await appendAudit(context.db, session, {
      operationId: `refund-sync:${fresh.operationId}:${amount}`,
      requestHash: requestFingerprint({ operationId: fresh.operationId, before: fresh.amount, after: amount }),
      actor: { type: 'system' }, entityType: 'order', entityId: order._id,
      action: 'order.refund.reconciled', changes: { before: { amount: fresh.amount }, after: { amount } },
    });
    return { ...fresh, amount, updatedAt: now };
  });
