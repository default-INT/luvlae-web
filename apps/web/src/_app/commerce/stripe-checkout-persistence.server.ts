import 'server-only';

import { fail } from '@/shared/lib/api/index.server';

import { collections } from './collections.server';
import { appendPaymentTransaction } from './payments.server';

import type { ClientSession, Db } from 'mongodb';
import type Stripe from 'stripe';
import type { CheckoutContext, CheckoutTransition } from './stripe-checkout-policy.server';

interface CheckoutOperation {
  db: Db;
  session: ClientSession;
  event?: Stripe.Event;
  context: CheckoutContext;
  transition: CheckoutTransition;
  now: Date;
}

const inventoryChanges = {
  commit: { stockDelta: -1, state: 'committed' },
  release: { stockDelta: 0, state: 'released' },
} as const;

const updateInventory = async ({ db, session, context, transition, now }: CheckoutOperation) => {
  const reservation = context.attempt.inventoryReservation;

  if (transition.inventory === 'hold' || reservation.state !== 'held') return;

  const { stockDelta } = inventoryChanges[transition.inventory];

  // MongoDB requires sequential operations within the transaction.
  for (const item of reservation.items) {
    const result = await collections(db).products.updateOne({
      _id: item.productId, 'inventory.reservedQuantity': { $gte: item.quantity },
      ...(stockDelta ? { 'inventory.stockQuantity': { $gte: item.quantity } } : {}),
    }, {
      $inc: { 'inventory.reservedQuantity': -item.quantity, 'inventory.stockQuantity': stockDelta * item.quantity },
      $set: { updatedAt: now },
    }, { session });

    if (!result.modifiedCount) fail(409, 'INVENTORY_CONFLICT', 'Reserved inventory requires reconciliation.');
  }
};

const reservationUpdate = ({ context, transition, now }: CheckoutOperation) => {
  if (transition.inventory === 'hold' || context.attempt.inventoryReservation.state !== 'held') return {};

  const timestamps = {
    commit: { 'inventoryReservation.committedAt': now },
    release: { 'inventoryReservation.releasedAt': now },
  };

  return {
    'inventoryReservation.state': inventoryChanges[transition.inventory].state,
    ...timestamps[transition.inventory],
  };
};

const updateAttempt = async (operation: CheckoutOperation) => {
  const { db, session, context, transition, now } = operation;

  await collections(db).attempts.updateOne({ _id: context.attempt._id }, { $set: {
    state: transition.state, active: !transition.terminal, updatedAt: now,
    ...(context.intentId ? { stripePaymentIntentId: context.intentId } : {}),
    ...reservationUpdate(operation),
  } }, { session });
};

const updateOrder = async ({ db, session, context, transition, now }: CheckoutOperation) => {
  const { pricing, contacts, paymentStatus, terminal, reconciliationRequired } = transition;

  await collections(db).orders.updateOne({ _id: context.order._id }, {
    $set: {
      updatedAt: now, 'payment.reconciliationRequired': reconciliationRequired,
      ...(paymentStatus ? { 'payment.status': paymentStatus } : {}),
      ...(pricing ? {
        pricing, 'payment.amountPaid': pricing.total, 'payment.settledAttemptId': context.attempt._id, 'payment.paidAt': now,
      } : {}),
      ...contacts,
    },
    $inc: { version: 1 },
    ...(terminal ? { $unset: { 'payment.activeAttemptId': '' } } : {}),
  }, { session });
};

const recordPayment = async ({ db, session, context, transition, event }: CheckoutOperation) => {
  if (!transition.observation) return;

  if (!event) return fail(409, 'PAYMENT_EVENT_REQUIRED', 'Financial observations require a provider event.');

  await appendPaymentTransaction(db, session, {
    operationId: `stripe-${event.id}`, orderId: context.order._id, attemptId: context.attempt._id, provider: 'stripe',
    providerObjectId: context.intentId!, providerEventId: event.id, type: 'payment',
    ...transition.observation, currency: 'USD', livemode: context.attempt.livemode,
    occurredAt: new Date(event.created * 1000),
  });
};

export const applyCheckoutTransition = async (operation: CheckoutOperation) => {
  await updateInventory(operation);
  await updateAttempt(operation);
  await updateOrder(operation);
  await recordPayment(operation);
};
