import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';
import { hashToken } from '@/shared/lib/security/index.server';
import { createStripeClient } from '@/shared/lib/stripe/index.server';

import { appendAudit } from './audit.server';
import { collections } from './collections.server';
import { applyCheckoutTransition } from './stripe-checkout-persistence.server';
import { planCheckoutTransition, validateCheckoutAssociation, validateCheckoutSession } from './stripe-checkout-policy.server';

import type Stripe from 'stripe';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const cancelGuestCheckout = async (database: DatabaseContext, id: string, token: string, stripe?: Stripe) => {
  const { db } = database;
  const { orders, attempts } = collections(db);

  const order = /^[a-f0-9]{24}$/.test(id) && /^[A-Za-z0-9_-]{43}$/.test(token)
    ? await orders.findOne({ _id: new ObjectId(id), checkoutMode: 'stripe',
      'guestAccess.tokenHash': hashToken(token), 'guestAccess.expiresAt': { $gt: new Date() } }) : null;

  if (!order) return fail(404, 'NOT_FOUND', 'Checkout not found.');

  const attempt = await attempts.findOne({ orderId: order._id });

  if (!attempt?.stripeSessionId) return fail(409, 'CHECKOUT_NOT_READY', 'Resume checkout before trying again.');

  const client = stripe ?? createStripeClient();
  let checkout = await client.checkout.sessions.retrieve(attempt.stripeSessionId, { expand: ['payment_intent'] });
  validateCheckoutSession(checkout, attempt.stripeSessionId);
  validateCheckoutAssociation(checkout, attempt, order);

  if (checkout.status === 'open') {
    try {
      await client.checkout.sessions.expire(checkout.id);
    } catch {
      // A completed payment or another cancellation can win the race. Re-read before deciding.
    }

    checkout = await client.checkout.sessions.retrieve(checkout.id, { expand: ['payment_intent'] });
  }

  // Release stock only after Stripe confirms that this Session can no longer accept payment.
  validateCheckoutSession(checkout, attempt.stripeSessionId);

  if (checkout.status === 'open') {
    return fail(503, 'CHECKOUT_CANCEL_FAILED', 'Checkout could not be cancelled. Retry cancellation.');
  }

  if (checkout.status !== 'expired' || checkout.payment_status !== 'unpaid') {
    return fail(409, 'CHECKOUT_CANNOT_CANCEL', 'Payment may be in progress. Check the order status before editing.');
  }

  return inTransaction(database, async session => {
    const currentAttempt = await attempts.findOne({ _id: attempt._id }, { session });
    const currentOrder = await orders.findOne({ _id: order._id }, { session });

    if (!currentAttempt || !currentOrder) return fail(404, 'NOT_FOUND', 'Checkout not found.');

    const context = validateCheckoutAssociation(checkout, currentAttempt, currentOrder);

    if (currentOrder.payment.settledAttemptId || currentOrder.payment.amountPaid > 0
      || currentAttempt.inventoryReservation.state === 'committed') {
      return fail(409, 'CHECKOUT_CANNOT_CANCEL', 'This order has already been paid.');
    }

    const now = new Date();
    const transition = planCheckoutTransition(context, 'checkout.session.expired');

    if (!transition && currentAttempt.inventoryReservation.state !== 'released') {
      return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The reservation requires reconciliation before editing.');
    }

    if (transition) await applyCheckoutTransition({ db, session, context, transition, now });

    if (currentOrder.orderStatus !== 'cancelled') {
      await orders.updateOne({ _id: order._id }, { $set: {
        orderStatus: 'cancelled', 'fulfillment.status': 'cancelled', updatedAt: now,
      } }, { session });
      await appendAudit(db, session, {
        operationId: `guest-cancel-${attempt._id.toHexString()}`, requestHash: attempt.requestHash,
        actor: { type: 'system' }, entityType: 'order', entityId: order._id,
        action: 'order.guest_cancel_checkout', changes: { orderStatus: 'cancelled' },
      });
    }

    return { cancelled: true };
  });
};
