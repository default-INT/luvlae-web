import type { OrderDetail } from './types';

export interface OrderPaymentRequest { operationId: string; version: number; reason: string; kind: 'cancel' | 'refund' }

export const activeOrderRefund = (order: Pick<OrderDetail, 'refunds'>) => order.refunds.find(refund =>
  ['requested', 'pending', 'unknown'].includes(refund.status));

export const recoverOrderPaymentRequest = (
  order: Pick<OrderDetail, 'refunds' | 'version' | 'canCancel' | 'cancellationRequest'>,
): OrderPaymentRequest | null => {
  const active = activeOrderRefund(order);

  if (active) {
    if (active.source === 'stripe' || !['requested', 'unknown'].includes(active.status)
      || !active.operationId || !active.reason) return null;

    return { operationId: active.operationId, version: active.requestedVersion ?? order.version,
      reason: active.reason, kind: active.kind };
  }

  if (!order.canCancel && order.cancellationRequest?.status === 'pending') {
    return { operationId: order.cancellationRequest.operationId, version: order.version,
      reason: order.cancellationRequest.reason, kind: 'cancel' };
  }

  return null;
};

export const refundNeedsRefresh = (order: Pick<OrderDetail, 'refunds' | 'cancellationRequest'>) => !!activeOrderRefund(order)
  || order.cancellationRequest?.status === 'pending';
