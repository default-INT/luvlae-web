import 'server-only';

import Stripe from 'stripe';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit } from './audit.server';
import { collections } from './collections.server';

import type { CheckoutAttempt } from './models';
import type { ShippingAddress } from '@/entities/order';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const stripeShipping = (address: ShippingAddress) => ({ name: address.recipientName,
  address: { line1: address.line1, ...(address.line2 ? { line2: address.line2 } : {}), city: address.city,
    state: address.state, postal_code: address.postalCode, country: address.country } });

export const prepareCustomerProvision = (attempt: CheckoutAttempt): CheckoutAttempt['customerProvision'] => {
  if (!attempt.shippingSnapshot) return fail(409, 'SHIPPING_REQUIRED', 'A validated delivery address is required.');

  return { state: 'pending', idempotencyKey: `customer-${attempt._id.toHexString()}`, apiVersion: Stripe.API_VERSION,
    createdAt: attempt.createdAt, parameters: { name: attempt.shippingSnapshot.recipientName,
      shipping: stripeShipping(attempt.shippingSnapshot), metadata: { orderId: attempt.orderId.toHexString(),
        attemptId: attempt._id.toHexString() } } };
};

// The saved request precedes every external call; retries never derive parameters from billing details or current config.
export const provisionShippingCustomer = async (context: DatabaseContext, initial: CheckoutAttempt, stripe: Stripe) => {
  if (!initial.customerProvision || initial.customerProvision.state === 'ready') return initial;

  if (!initial.active || initial.state !== 'creating') return initial;

  if (initial.inventoryReservation.expiresAt.getTime() <= Date.now()
    || initial.customerProvision.createdAt.getTime() + 23 * 3600000 <= Date.now()) {
    return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'Recover the original checkout before attempting payment again.');
  }

  let customer: Stripe.Customer;

  try {
    customer = await stripe.customers.create(initial.customerProvision.parameters, {
      idempotencyKey: initial.customerProvision.idempotencyKey, apiVersion: initial.customerProvision.apiVersion,
    });
  } catch {
    return fail(503, 'STRIPE_CHECKOUT_UNAVAILABLE', 'Checkout could not be opened. Retry the same checkout.');
  }

  if (!customer.id || customer.metadata?.attemptId !== initial._id.toHexString()
    || customer.metadata?.orderId !== initial.orderId.toHexString()) {
    return fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The delivery customer does not match the checkout.');
  }

  return inTransaction(context, async session => {
    const { attempts } = collections(context.db);
    const current = await attempts.findOne({ _id: initial._id }, { session });

    if (!current?.customerProvision) return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The checkout requires recovery.');

    if (current.customerProvision.customerId && current.customerProvision.customerId !== customer.id) {
      fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The checkout already belongs to another delivery customer.');
    }

    if (current.customerProvision.state === 'pending') {
      await attempts.updateOne({ _id: current._id, 'customerProvision.state': 'pending' }, { $set: {
        'customerProvision.state': 'ready', 'customerProvision.customerId': customer.id, updatedAt: new Date(),
      } }, { session });
    }

    return { ...current, customerProvision: { ...current.customerProvision, state: 'ready' as const, customerId: customer.id } };
  });
};

export const freezeShippingSession = async (
  context: DatabaseContext, attempt: CheckoutAttempt, parameters: Stripe.Checkout.SessionCreateParams,
) => inTransaction(context, async session => {
  const { attempts } = collections(context.db);
  const current = await attempts.findOne({ _id: attempt._id }, { session });

  if (!current) return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The checkout requires recovery.');

  if (current.stripeRequest) return current;

  if (current.inventoryReservation.expiresAt.getTime() <= Date.now()) {
    return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The original checkout deadline has passed.');
  }

  if (!current.active || current.state !== 'creating') {
    return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The checkout is no longer open for payment.');
  }

  if (current.customerProvision?.state !== 'ready' || current.customerProvision.customerId !== parameters.customer) {
    fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The delivery customer is not ready.');
  }

  const stripeRequest = { apiVersion: Stripe.API_VERSION, parameters };
  await attempts.updateOne({ _id: current._id, stripeRequest: { $exists: false } }, {
    $set: { stripeRequest, updatedAt: new Date() },
  }, { session });
  return { ...current, stripeRequest };
});

// No Session request has ever existed, so Customer creation alone cannot accept a payment.
// This transaction competes with Session freezing on the same attempt document.
export const cancelUnopenedShippingCheckout = (context: DatabaseContext, initial: CheckoutAttempt) =>
  inTransaction(context, async session => {
    const { attempts, products, orders } = collections(context.db);
    const attempt = await attempts.findOne({ _id: initial._id }, { session });

    if (!attempt?.shippingSnapshot || attempt.stripeRequest || attempt.stripeSessionId) {
      return fail(409, 'CHECKOUT_NOT_READY', 'Resume checkout before trying cancellation again.');
    }

    if (attempt.inventoryReservation.state === 'released') return { cancelled: true };

    if (!attempt.active || attempt.state !== 'creating' || attempt.inventoryReservation.state !== 'held') {
      return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'The checkout requires recovery.');
    }

    const order = await orders.findOne({ _id: attempt.orderId }, { session });

    if (!order || order.payment.amountPaid || order.payment.settledAttemptId) {
      return fail(409, 'CHECKOUT_CANNOT_CANCEL', 'This order cannot be cancelled.');
    }

    const now = new Date();

    for (const item of attempt.inventoryReservation.items) {
      const result = await products.updateOne({ _id: item.productId, 'inventory.reservedQuantity': { $gte: item.quantity } }, {
        $inc: { 'inventory.reservedQuantity': -item.quantity, 'inventory.version': 1 }, $set: { updatedAt: now },
      }, { session });

      if (!result.modifiedCount) fail(409, 'INVENTORY_CONFLICT', 'Reserved inventory requires reconciliation.');
    }

    await attempts.updateOne({ _id: attempt._id }, { $set: {
      state: 'cancelled', active: false, 'inventoryReservation.state': 'released',
      'inventoryReservation.releasedAt': now, updatedAt: now,
    } }, { session });
    await orders.updateOne({ _id: order._id }, { $set: {
      orderStatus: 'cancelled', 'fulfillment.status': 'cancelled', 'payment.status': 'expired', updatedAt: now,
    }, $unset: { 'payment.activeAttemptId': '' }, $inc: { version: 1 } }, { session });
    await appendAudit(context.db, session, { operationId: `guest-cancel-${attempt._id.toHexString()}`,
      requestHash: attempt.requestHash, actor: { type: 'system' }, entityType: 'order', entityId: order._id,
      action: 'order.guest_cancel_checkout', changes: { orderStatus: 'cancelled' } });
    return { cancelled: true };
  });
