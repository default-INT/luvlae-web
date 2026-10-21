import 'server-only';

import { ObjectId } from 'mongodb';

import { requireRefundSchema } from './refund-migration.server';
import { collections } from './collections.server';
import { applyProviderRefund } from './refund-persistence.server';
import { listProviderRefunds } from './refund-provider.server';
import { resumeRefundOperation } from './refunds.server';
import { processStripeEvent } from './stripe-webhook.server';

import type Stripe from 'stripe';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

// Explicit, bounded operator job. No request-time scans and no implicit scheduler.
export const reconcileRefundBatch = async (context: DatabaseContext, stripe: Stripe, limit: number, cursor?: string) => {
  await requireRefundSchema(context.db);
  const { orders, attempts, refunds, events: inbox } = collections(context.db);

  const ordersToInspect = await orders.find({
    checkoutMode: { $ne: 'mock' },
    $or: [{ 'payment.settledAttemptId': { $exists: true } }, { 'cancellationRequest.status': 'pending' }],
    ...(cursor ? { _id: { $gt: new ObjectId(cursor) } } : {}),
  }).sort({ _id: 1 }).limit(limit).toArray();

  const summary = { inspected: 0, refundsReconciled: 0, eventsReplayed: 0, unresolved: 0,
    nextCursor: ordersToInspect.at(-1)?._id.toHexString() ?? null };

  const observedRefundIds = new Set<string>();

  for (const order of ordersToInspect) {
    summary.inspected += 1;

    try {
      const attempt = order.payment.settledAttemptId
        ? await attempts.findOne({ _id: order.payment.settledAttemptId }) : null;

      if (attempt?.stripePaymentIntentId) {
        const providerRefunds = await listProviderRefunds(stripe, attempt.stripePaymentIntentId);

        for (const refund of providerRefunds) {
          await applyProviderRefund(context, refund);
          summary.refundsReconciled += 1;
          observedRefundIds.add(refund.id);
        }

      }

      const pending = await refunds.find({ orderId: order._id, active: true, source: 'admin' }).toArray();

      for (const request of pending) await resumeRefundOperation(context, request, stripe);
    } catch {
      summary.unresolved += 1;
    }
  }

  // Read the account event feed once per batch, not once for every order.
  if (observedRefundIds.size) {
    try {
      const providerEvents = await stripe.events.list({
        types: ['refund.created', 'refund.updated', 'refund.failed'], limit: 100,
        created: { gte: Math.max(Math.floor((ordersToInspect[0]?.createdAt.getTime() ?? Date.now()) / 1000) - 120,
          Math.floor(Date.now() / 1000) - 29 * 86400) },
      }).autoPagingToArray({ limit: 1000 });

      if (providerEvents.length === 1000) summary.unresolved += 1;

      for (const event of providerEvents.reverse()) {
        if ('id' in event.data.object && observedRefundIds.has(event.data.object.id)) {
          await processStripeEvent(context, event, stripe);
          summary.eventsReplayed += 1;
        }
      }
    } catch { summary.unresolved += 1; }
  }

  // Failed association may have prevented attaching an order ID; replay durable inbox entries independently.
  const failed = await inbox.find({ status: { $in: ['pending', 'failed'] },
    eventType: { $in: ['refund.created', 'refund.updated', 'refund.failed',
      'charge.refunded'] } }).sort({ nextAttemptAt: 1 }).limit(limit).toArray();

  for (const entry of failed) {
    try {
      await processStripeEvent(context, await stripe.events.retrieve(entry.eventId), stripe);
      summary.eventsReplayed += 1;
    } catch { summary.unresolved += 1; }
  }

  return summary;
};
