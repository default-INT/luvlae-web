import nextEnv from '@next/env';
import { ObjectId } from 'mongodb';

import { associateRecoveredCheckoutSession } from '../src/_app/commerce/checkout-session.server';
import { collections } from '../src/_app/commerce/collections.server';
import { processStripeEvent } from '../src/_app/commerce/stripe-webhook.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { withDatabase } from '../src/shared/lib/mongodb/index.server';
import { createStripeClient } from '../src/shared/lib/stripe/index.server';

import type Stripe from 'stripe';
import type { CheckoutAttempt } from '../src/_app/commerce/models';

const eventTypes: Stripe.EventListParams.Type[] = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
];

const objectId = (event: Stripe.Event) => 'id' in event.data.object ? event.data.object.id : undefined;

const findSession = async (stripe: Stripe, attempt: CheckoutAttempt) => {
  if (attempt.stripeSessionId) return stripe.checkout.sessions.retrieve(attempt.stripeSessionId);

  const sessions = await stripe.checkout.sessions.list({
    created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 120 }, limit: 100,
  }).autoPagingToArray({ limit: 1000 });

  const matches = sessions.filter(checkout => checkout.metadata?.orderId === attempt.orderId.toHexString()
    && checkout.metadata?.attemptId === attempt._id.toHexString());

  // Multiple candidates or a truncated search are an operator decision, never a reason to release stock.
  if (matches.length !== 1 || sessions.length === 1000) return null;

  return matches[0];
};

const run = async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

  if (!process.env.DB_CONFIRM_NAME || process.env.DB_CONFIRM_NAME !== process.env.NEXT_MONGODB_DB_NAME) {
    throw new ApiError(400, 'DB_CONFIRMATION_REQUIRED', 'Set DB_CONFIRM_NAME to the exact configured database name.');
  }

  const limit = Number(process.argv[2] ?? 20);
  const cursor = process.argv[3];

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ApiError(400, 'INVALID_LIMIT', 'Use a batch limit between 1 and 100.');
  }

  if (cursor && !/^[a-f0-9]{24}$/.test(cursor)) {
    throw new ApiError(400, 'INVALID_CURSOR', 'Use the nextCursor returned by the preceding batch.');
  }

  const stripe = createStripeClient();
  const summary = { inspected: 0, associationsRecovered: 0, eventsReplayed: 0, awaitingProviderEvent: 0, unresolved: 0 };
  let nextCursor: string | null = null;

  await withDatabase(async context => {
    const attempts = await collections(context.db).attempts.find({
      active: true, ...(cursor ? { _id: { $gt: new ObjectId(cursor) } } : {}),
    }).sort({ _id: 1 }).limit(limit).toArray();

    nextCursor = attempts.at(-1)?._id.toHexString() ?? null;

    for (const attempt of attempts) {
      summary.inspected += 1;

      try {
        const checkout = await findSession(stripe, attempt);

        if (!checkout) {
          summary.unresolved += 1;
          continue;
        }

        await associateRecoveredCheckoutSession(context, attempt._id, checkout);

        if (!attempt.stripeSessionId) summary.associationsRecovered += 1;

        const events = await stripe.events.list({
          types: eventTypes, created: { gte: Math.floor(attempt.createdAt.getTime() / 1000) - 120 }, limit: 100,
        }).autoPagingToArray({ limit: 1000 });

        const related = events.filter(event => objectId(event) === checkout.id).reverse();

        for (const event of related) {
          // These are authentic API-retrieved Stripe events, never synthetic financial journal entries.
          await processStripeEvent(context, event, stripe);
          summary.eventsReplayed += 1;
        }

        if (!related.length && checkout.status !== 'open') summary.awaitingProviderEvent += 1;
      } catch (error) {
        summary.unresolved += 1;
        console.error('Stripe recovery attempt failed.', { code: error instanceof ApiError ? error.code : 'RECOVERY_FAILED' });
      }
    }
  });

  console.log('Stripe reconciliation completed.', { ...summary, nextCursor });

  if (summary.unresolved || summary.awaitingProviderEvent) process.exitCode = 1;
};

run().catch(error => {
  console.error('Stripe reconciliation failed.', { code: error instanceof ApiError ? error.code : 'RECOVERY_FAILED' });
  process.exitCode = 1;
});
