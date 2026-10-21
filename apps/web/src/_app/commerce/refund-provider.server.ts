import 'server-only';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { collections } from './collections.server';
import { applyProviderRefund } from './refund-persistence.server';
import { reconcileRefundRequestAmount } from './refund-request-reconciliation.server';
import { applyCheckoutTransition } from './stripe-checkout-persistence.server';
import { planCheckoutTransition, validateCheckoutAssociation, validateCheckoutSession } from './stripe-checkout-policy.server';

import type Stripe from 'stripe';
import type { Refund } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const listProviderRefunds = async (stripe: Stripe, intent: string) => {
  const result = await stripe.refunds.list({ payment_intent: intent, limit: 100 }).autoPagingToArray({ limit: 1000 });

  if (result.length === 1000) fail(409, 'REFUND_RECONCILIATION_REQUIRED', 'The refund history requires manual reconciliation.');

  return result;
};

export const reconcileUnpaidCancellation = async (context: DatabaseContext, request: Refund, stripe: Stripe) => {
  const order = await collections(context.db).orders.findOne({ _id: request.orderId });

  if (!order?.payment.activeAttemptId) return;

  const attempt = await collections(context.db).attempts.findOne({ _id: order.payment.activeAttemptId });

  if (!attempt?.stripeSessionId) {
    return fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Recover the active Checkout Session before cancelling.');
  }

  let checkout = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId, { expand: ['payment_intent'] });
  validateCheckoutSession(checkout, attempt.stripeSessionId);
  validateCheckoutAssociation(checkout, attempt, order);

  if (checkout.status === 'open') {
    // Expiration may race payment completion. Re-read on any expire error; never release on that error alone.
    try { await stripe.checkout.sessions.expire(checkout.id); } catch { /* Provider retrieval below decides the outcome. */ }

    checkout = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId, { expand: ['payment_intent'] });
  }

  if (checkout.status !== 'expired' || checkout.payment_status !== 'unpaid'
    || (checkout.payment_intent && (typeof checkout.payment_intent === 'string'
      || !['canceled', 'requires_payment_method'].includes(checkout.payment_intent.status)))) {
    fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Payment completion or processing must be reconciled before cancellation.');
  }

  await inTransaction(context, async session => {
    const freshAttempt = await collections(context.db).attempts.findOne({ _id: attempt._id }, { session });
    const freshOrder = await collections(context.db).orders.findOne({ _id: order._id }, { session });

    if (!freshAttempt || !freshOrder) return fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The payment association changed.');

    const policy = validateCheckoutAssociation(checkout, freshAttempt, freshOrder);
    const transition = planCheckoutTransition(policy, 'checkout.session.expired');

    if (!transition) return;

    // This verified API read releases an unpaid reservation. Financial journal entries still require authentic events.
    await applyCheckoutTransition({ db: context.db, session, context: policy, transition,
      now: new Date() });
  });
};

export const executeProviderRefund = async (context: DatabaseContext, initialRequest: Refund, stripe: Stripe) => {
  let request = initialRequest;

  if (request.providerRefundId) {
    await applyProviderRefund(context, await stripe.refunds.retrieve(request.providerRefundId));
    return;
  }

  if (!request.stripePaymentIntentId) {
    return fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'The settled payment must be associated before refunding.');
  }

  const existing = await listProviderRefunds(stripe, request.stripePaymentIntentId);

  for (const refund of existing) await applyProviderRefund(context, refund);

  const matching = existing.find(refund => refund.metadata?.operationId === request.operationId);

  if (matching) return;

  request = await reconcileRefundRequestAmount(context, request);

  if (request.providerRefundId) {
    await applyProviderRefund(context, await stripe.refunds.retrieve(request.providerRefundId));
    return;
  }

  if (!request.active) return;

  if (request.amount === 0) return request;

  // Pending refunds consume refundable capacity too. Do not race a Dashboard refund or recreate an aged key.
  const occupied = existing.filter(refund => !['failed', 'canceled'].includes(refund.status ?? ''))
    .reduce((sum, refund) => sum + refund.amount, 0);

  const order = await collections(context.db).orders.findOne({ _id: request.orderId });

  if (!order || occupied + request.amount > order.payment.amountPaid) {
    if (!request.providerRequestStartedAt) {
      await collections(context.db).refunds.updateOne({ _id: request._id, providerRequestStartedAt: { $exists: false } },
        { $set: {
          status: 'failed', active: false, failureReason: 'REFUND_AMOUNT_CHANGED', updatedAt: new Date(),
        } });
    }

    fail(409, 'REFUND_RECONCILIATION_REQUIRED', 'Another refund changed the available amount.');
  }

  if (Date.now() - (request.providerRequestStartedAt ?? new Date()).getTime() >= 23 * 60 * 60 * 1000) {
    fail(409, 'REFUND_RECONCILIATION_REQUIRED', 'The original refund request is too old to safely recreate.');
  }

  const submitted = await collections(context.db).refunds.findOneAndUpdate({
    _id: request._id, active: true, amount: request.amount,
    leaseToken: request.leaseToken, leaseUntil: { $gt: new Date() },
    providerRefundId: { $exists: false },
    providerRequestStartedAt: request.providerRequestStartedAt ?? { $exists: false },
  }, { $set: { providerRequestStartedAt: request.providerRequestStartedAt ?? new Date() } },
  { returnDocument: 'after' });

  if (!submitted) return fail(409, 'REFUND_IN_PROGRESS', 'Reload or resume the current refund operation.');

  request = submitted;

  const refund = await stripe.refunds.create({
    payment_intent: request.stripePaymentIntentId, amount: request.amount,
    metadata: { orderId: request.orderId.toHexString(), operationId: request.operationId },
  }, { idempotencyKey: `luvlae-refund:${request.operationId}`, apiVersion: request.stripeApiVersion });

  await applyProviderRefund(context, refund);
};

export const checkEarlyRefundAssociation = async (context: DatabaseContext, stripe: Stripe, refund: Stripe.Refund) => {
  const intentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;

  if (!intentId || await collections(context.db).attempts.findOne({ stripePaymentIntentId: intentId })) return;

  const intent = await stripe.paymentIntents.retrieve(intentId);

  if (intent.metadata?.orderId || intent.metadata?.attemptId) {
    fail(503, 'REFUND_NOT_READY', 'Checkout settlement must be reconciled before this refund.');
  }
};
