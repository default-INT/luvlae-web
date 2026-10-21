import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recoverOrderPaymentRequest, refundNeedsRefresh } from '../src/_pages/admin/model/order-refunds';

import type { OrderRefund } from '../src/_pages/admin/model/types';

const refund = (changes: Partial<OrderRefund> = {}): OrderRefund => ({
  id: 'refund-record', operationId: 'original-operation', requestedVersion: 4,
  source: 'admin', kind: 'cancel', amount: 2999, currency: 'USD', status: 'unknown',
  reason: 'Customer requested cancellation', createdAt: '2026-10-21T10:00:00.000Z',
  updatedAt: '2026-10-21T10:00:00.000Z', ...changes,
});

test('reopening an unresolved operation preserves its payment identity, amount scope and original reason', () => {
  const order = { refunds: [refund()], version: 12, canCancel: false };
  assert.deepEqual(recoverOrderPaymentRequest(order), {
    operationId: 'original-operation', version: 4, reason: 'Customer requested cancellation', kind: 'cancel',
  });
  assert.equal(refundNeedsRefresh(order), true);
});

test('pending Stripe refunds are observed, never resumed as a new admin payment request', () => {
  for (const record of [refund({ status: 'pending' }), refund({ source: 'stripe', status: 'unknown' })]) {
    const order = { refunds: [record], version: 12, canCancel: false };
    assert.equal(recoverOrderPaymentRequest(order), null);
    assert.equal(refundNeedsRefresh(order), true);
  }
});

test('terminal refunds do not reuse an old payment operation; failed cancellation can start a fresh retry', () => {
  for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
    const order = { refunds: [refund({ status })], version: 12, canCancel: true };
    assert.equal(recoverOrderPaymentRequest(order), null);
    assert.equal(refundNeedsRefresh(order), false);
  }

  const order = { refunds: [refund({ status: 'failed' })], version: 12, canCancel: true,
    cancellationRequest: { status: 'pending' as const, reason: 'Original cancellation', operationId: 'original-operation' } };

  assert.equal(recoverOrderPaymentRequest(order), null);
  assert.equal(refundNeedsRefresh(order), true);
});

test('a pending cancellation without a loaded refund replays its saved operation instead of generating another identity', () => {
  const order = { refunds: [], version: 12, canCancel: false,
    cancellationRequest: { status: 'pending' as const, reason: 'Original cancellation', operationId: 'original-operation' } };

  assert.deepEqual(recoverOrderPaymentRequest(order), {
    operationId: 'original-operation', version: 12, reason: 'Original cancellation', kind: 'cancel',
  });
});
