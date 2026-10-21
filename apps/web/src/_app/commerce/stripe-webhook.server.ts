import 'server-only';

import { ObjectId } from 'mongodb';

import { ApiError, fail, handle, json } from '@/shared/lib/api/index.server';
import { inTransaction, withDatabase } from '@/shared/lib/mongodb/index.server';
import { createStripeClient, validateStripeEventEnvironment, verifyStripeEvent } from '@/shared/lib/stripe/index.server';

import { applyProviderRefund } from './refund-persistence.server';
import { checkEarlyRefundAssociation, listProviderRefunds } from './refund-provider.server';
import { collections } from './collections.server';
import { applyCheckoutTransition } from './stripe-checkout-persistence.server';
import { planCheckoutTransition, validateCheckoutAssociation, validateCheckoutSession } from './stripe-checkout-policy.server';

import type { ClientSession, Db } from 'mongodb';
import type Stripe from 'stripe';
import type { PaymentEvent } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

const checkoutEvents = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
]);

const isFinished = (event: PaymentEvent | null) => ['processed', 'ignored'].includes(event?.status ?? '');
const replayed = () => ({ received: true, replayed: true });
const providerObjectId = (event: Stripe.Event) => 'id' in event.data.object ? event.data.object.id : event.id;

const receiveEvent = async (db: Db, event: Stripe.Event, now: Date) => {
  // Store identifiers and processing state, never raw payloads or customer data.
  await collections(db).events.updateOne({ provider: 'stripe', eventId: event.id }, { $setOnInsert: {
    _id: new ObjectId(), schemaVersion: 1, provider: 'stripe', eventId: event.id, eventType: event.type,
    providerObjectId: providerObjectId(event), livemode: event.livemode,
    providerCreatedAt: new Date(event.created * 1000), receivedAt: now,
    status: 'pending', processingAttempts: 0, nextAttemptAt: now,
  } }, { upsert: true });

  const inbox = await collections(db).events.findOne({ provider: 'stripe', eventId: event.id });

  if (!inbox) return fail(503, 'PAYMENT_EVENT_NOT_READY', 'The Stripe event is not available for processing.');

  return inbox;
};

const loadCheckoutContext = async (
  db: Db, session: ClientSession, checkout: Stripe.Checkout.Session, objectId: string,
) => {
  validateCheckoutSession(checkout, objectId);
  const attempt = await collections(db).attempts.findOne({ stripeSessionId: checkout.id }, { session });

  if (!attempt) {
    // Ordinary CLI fixtures and other sandbox applications have no local order.
    const hasOrderMetadata = [checkout.metadata?.orderId, checkout.metadata?.attemptId].some(Boolean);

    if (!hasOrderMetadata) return undefined;

    return fail(503, 'CHECKOUT_NOT_READY', 'Persist the Checkout Session association before retrying this event.');
  }

  const order = await collections(db).orders.findOne({ _id: attempt.orderId }, { session });
  return validateCheckoutAssociation(checkout, attempt, order);
};

const finishEvent = async (db: Db, session: ClientSession, id: ObjectId, status: 'processed' | 'ignored') => {
  await collections(db).events.updateOne({ _id: id }, {
    $set: { status, processedAt: new Date() }, $unset: { lastErrorCode: '' },
  }, { session });
  return { received: true, replayed: false, ignored: status === 'ignored' };
};

const processCheckout = async (
  database: DatabaseContext, event: Stripe.Event, inboxId: ObjectId,
  checkout: Stripe.Checkout.Session | undefined, now: Date,
) => inTransaction(database, async session => {
  const { db } = database;
  const { events } = collections(db);
  const inbox = await events.findOne({ _id: inboxId }, { session });
  const finish = (status: 'processed' | 'ignored') => finishEvent(db, session, inboxId, status);

  if (isFinished(inbox)) return replayed();

  if (!checkout) return finish('ignored');

  const context = await loadCheckoutContext(db, session, checkout, providerObjectId(event));

  if (!context) return finish('ignored');

  await events.updateOne({ _id: inboxId }, {
    $set: { orderId: context.order._id, attemptId: context.attempt._id },
  }, { session });

  const transition = planCheckoutTransition(context, event.type);

  if (!transition) return finish('ignored');

  await applyCheckoutTransition({ db, session, event, context, transition, now });
  return finish('processed');
});

const markEventFailed = async (db: Db, id: ObjectId, error: unknown) => {
  // Failed processing remains retryable and is never acknowledged as successful ingestion.
  await collections(db).events.updateOne({ _id: id, status: { $nin: ['processed', 'ignored'] } }, { $set: {
    status: 'failed', lastErrorCode: error instanceof ApiError ? error.code : 'STRIPE_PROCESSING_FAILED',
    nextAttemptAt: new Date(Date.now() + 60000),
  } });
};

export const processStripeEvent = async (database: DatabaseContext, event: Stripe.Event, stripe: Stripe) => {
  validateStripeEventEnvironment(event);

  const now = new Date();
  const inbox = await receiveEvent(database.db, event, now);

  if (isFinished(inbox)) return replayed();

  await collections(database.db).events.updateOne({ _id: inbox._id }, { $inc: { processingAttempts: 1 } });

  try {
    if (['refund.created', 'refund.updated', 'refund.failed'].includes(event.type)) {
      const refund = await stripe.refunds.retrieve(providerObjectId(event));
      await checkEarlyRefundAssociation(database, stripe, refund);
      const result = await applyProviderRefund(database, refund, event);
      return await inTransaction(database, session => finishEvent(database.db, session, inbox._id,
        result.ignored ? 'ignored' : 'processed'));
    }

    if (event.type === 'charge.refunded') {
      const charge = await stripe.charges.retrieve(providerObjectId(event));
      const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;

      if (!intentId) return await inTransaction(database, session => finishEvent(database.db, session, inbox._id, 'ignored'));

      const refunds = await listProviderRefunds(stripe, intentId);

      for (const refund of refunds) {
        await checkEarlyRefundAssociation(database, stripe, refund);
        await applyProviderRefund(database, refund, event);
      }

      return await inTransaction(database, session => finishEvent(database.db, session, inbox._id, 'processed'));
    }

    // Retrieve outside the transaction: stale events must not release a now-paid reservation.
    const checkout = checkoutEvents.has(event.type)
      ? await stripe.checkout.sessions.retrieve(providerObjectId(event), { expand: ['payment_intent'] })
      : undefined;

    return await processCheckout(database, event, inbox._id, checkout, now);
  } catch (error) {
    await markEventFailed(database.db, inbox._id, error);
    throw error;
  }
};

export const stripeWebhook = (request: Request) => handle(async () => {
  const stripe = createStripeClient();
  const event = await verifyStripeEvent(request, stripe);
  return withDatabase(async context => json(await processStripeEvent(context, event, stripe)));
})();
