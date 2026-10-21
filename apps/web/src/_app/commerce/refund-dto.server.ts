import 'server-only';

import { requireRefundSchema } from './refund-migration.server';
import { collections } from './collections.server';

import type { Db } from 'mongodb';
import type { Order } from './models';

export const refundDetailDto = async (db: Db, order: Order) => {
  await requireRefundSchema(db);
  const records = await collections(db).refunds.find({ orderId: order._id }).sort({ createdAt: -1, _id: -1 }).toArray();
  const active = records.some(record => record.active);
  const held = order.payment.disputed || order.payment.reconciliationRequired;
  const refundableAmount = Math.max(0, order.payment.amountPaid - order.payment.amountRefunded);
  return {
    refundableAmount,
    canCancel: !held && !active && order.orderStatus === 'open'
      && ['unfulfilled', 'processing'].includes(order.fulfillment.status),
    canRefund: !held && !active && !order.payment.activeAttemptId && refundableAmount > 0
      && (['shipped', 'delivered'].includes(order.fulfillment.status) || order.orderStatus === 'cancelled'),
    cancellationRequest: order.cancellationRequest ? {
      status: order.cancellationRequest.status, reason: order.cancellationRequest.reason,
      operationId: order.cancellationRequest.operationId,
    } : undefined,
    refunds: records.map(record => ({
      id: record._id.toHexString(), operationId: record.operationId, requestedVersion: record.requestedVersion,
      providerRefundId: record.providerRefundId, source: record.source, kind: record.kind,
      amount: record.amount, currency: record.currency, status: record.status,
      providerStatus: record.providerStatus, reason: record.reason, providerReason: record.providerReason,
      failureReason: record.failureReason,
      createdAt: record.createdAt.toISOString(), updatedAt: record.updatedAt.toISOString(),
    })),
  };
};
