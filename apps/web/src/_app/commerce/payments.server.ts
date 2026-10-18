import 'server-only';

import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';

import { requestFingerprint } from './audit.server';
import { collections } from './collections.server';
import { integerSchema } from './contracts';

import type { ClientSession, Db } from 'mongodb';
import type { PaymentTransaction } from './models';

const transactionSchema = z.strictObject({
  operationId: z.string().min(1).max(200),
  orderId: z.instanceof(ObjectId), attemptId: z.instanceof(ObjectId), provider: z.literal('stripe'),
  providerObjectId: z.string().min(1).max(200), providerEventId: z.string().min(1).max(200),
  type: z.enum(['payment', 'refund', 'dispute']), status: z.enum(['pending', 'succeeded', 'failed', 'cancelled']),
  amount: integerSchema, currency: z.literal('USD'), livemode: z.boolean(), occurredAt: z.date(),
});

// Internal-only. The future verified provider processor must call this in the same transaction
// as the order/payment/inventory change and event completion. Never accept financial facts from a browser.
export const appendPaymentTransaction = async (
  db: Db, session: ClientSession, input: Omit<PaymentTransaction, '_id' | 'schemaVersion' | 'recordedAt'>,
) => {
  const value = transactionSchema.parse(input);
  const { orders, attempts, events, transactions } = collections(db);
  const order = await orders.findOne({ _id: value.orderId }, { session });
  const attempt = await attempts.findOne({ _id: value.attemptId, orderId: value.orderId }, { session });

  const event = await events.findOne({
    provider: value.provider, eventId: value.providerEventId, orderId: value.orderId, attemptId: value.attemptId,
  }, { session });

  if (!order || !attempt || !event || attempt.livemode !== value.livemode || event.livemode !== value.livemode) {
    fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'Payment references or environment do not match.');
  }

  const existing = await transactions.findOne({
    $or: [
      { operationId: value.operationId },
      { provider: value.provider, providerEventId: value.providerEventId, providerObjectId: value.providerObjectId,
        type: value.type, status: value.status },
    ],
  }, { session });

  if (existing) {
    const { _id, schemaVersion: _schemaVersion, recordedAt: _recordedAt, ...previous } = existing;

    const fingerprint = (entry: typeof value) => requestFingerprint({
      ...entry, orderId: entry.orderId.toHexString(), attemptId: entry.attemptId.toHexString(),
      occurredAt: entry.occurredAt.toISOString(),
    });

    if (fingerprint(previous) !== fingerprint(value)) {
      fail(409, 'IDEMPOTENCY_CONFLICT', 'A financial operation cannot be rewritten.');
    }
    return _id;
  }
  const document = { ...value, _id: new ObjectId(), schemaVersion: 1, recordedAt: new Date() };
  await transactions.insertOne(document, { session });
  return document._id;
};
