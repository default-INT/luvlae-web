import 'server-only';

import { ObjectId } from 'mongodb';
import Stripe from 'stripe';
import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction, withDatabase } from '@/shared/lib/mongodb/index.server';
import { hashToken } from '@/shared/lib/security/index.server';
import { createStripeClient, requireStripeCheckoutConfiguration } from '@/shared/lib/stripe/index.server';

import { collections } from './collections.server';
import { integerSchema, operationSchema, skuSchema, versionSchema } from './contracts';
import { reserveOrder } from './reservations.server';
import { stripeRequestMigrationName } from './stripe-request-migration.server';
import { validateCheckoutAssociation, validateCheckoutSession } from './stripe-checkout-policy.server';

import type { CheckoutAttempt } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';
import type { GuestCheckout } from '@/entities/order';

export const checkoutSessionSchema = z.strictObject({
  operationId: operationSchema,
  guestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  items: z.array(z.strictObject({
    sku: skuSchema, quantity: integerSchema.min(1).max(99), productVersion: versionSchema,
  })).min(1).max(20),
}).refine(value => new Set(value.items.map(item => item.sku)).size === value.items.length);

const pricingPolicy = { shipping: 'included-us-v1', tax: 'included-v1', discount: 'none-v1' as const };
const dayMilliseconds = 86400000;
const mismatch = () => fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'Checkout references do not match the order.');

// Parameters are built exclusively from the immutable persisted quote, never from retry-time configuration.
export const checkoutSessionParameters = (attempt: CheckoutAttempt): Stripe.Checkout.SessionCreateParams => ({
  mode: 'payment', ui_mode: 'embedded_page', redirect_on_completion: 'never',
  allowed_payment_method_types: ['card'], billing_address_collection: 'required', locale: 'en',
  wallet_options: { link: { display: 'never' } },
  name_collection: { individual: { enabled: true, optional: false } },
  shipping_address_collection: { allowed_countries: ['US'] },
  customer_creation: 'if_required',
  automatic_tax: { enabled: true },
  allow_promotion_codes: false,
  client_reference_id: attempt.orderId.toHexString(),
  metadata: { orderId: attempt.orderId.toHexString(), attemptId: attempt._id.toHexString() },
  payment_intent_data: { metadata: { orderId: attempt.orderId.toHexString(), attemptId: attempt._id.toHexString() } },
  expires_at: Math.floor(attempt.inventoryReservation.expiresAt.getTime() / 1000),
  line_items: attempt.quoteSnapshot.items.map(item => ({
    quantity: item.quantity,
    price_data: { currency: 'usd', unit_amount: item.unitAmount,
      product_data: { name: item.name, metadata: { sku: item.sku } }, tax_behavior: 'inclusive' },
  })),
});

// Also used by the operator recovery command after retrieving a real provider Session.
export const associateRecoveredCheckoutSession = async (
  context: DatabaseContext, attemptId: ObjectId, checkout: Stripe.Checkout.Session,
) => inTransaction(context, async session => {
  const { attempts, orders } = collections(context.db);
  const attempt = await attempts.findOne({ _id: attemptId }, { session });

  if (!attempt) return mismatch();

  const order = await orders.findOne({ _id: attempt.orderId }, { session });
  validateCheckoutSession(checkout, checkout.id);
  validateCheckoutAssociation(checkout, attempt, order);
  const pricing = attempt.quoteSnapshot.pricing;

  const rules = {
    ownedSession: !attempt.stripeSessionId || attempt.stripeSessionId === checkout.id,
    embedded: checkout.ui_mode === 'embedded_page',
    deadline: checkout.expires_at === Math.floor(attempt.inventoryReservation.expiresAt.getTime() / 1000),
    finalPricing: pricing.state === 'final',
    orderPricing: order?.pricing.state === 'final' && order.pricing.total === pricing.total
      && order.pricing.subtotal === pricing.subtotal && order.pricing.discount === pricing.discount
      && order.pricing.shipping === pricing.shipping && order.pricing.tax === pricing.tax,
    subtotal: checkout.amount_subtotal === pricing.subtotal,
    total: checkout.amount_total === pricing.total,
    discount: checkout.total_details?.amount_discount === 0,
    shipping: checkout.total_details?.amount_shipping === 0,
    tax: checkout.total_details?.amount_tax === 0,
  };

  if (!Object.values(rules).every(Boolean)) return mismatch();

  const intentId = typeof checkout.payment_intent === 'string' ? checkout.payment_intent : checkout.payment_intent?.id;

  const needsAssociation = !attempt.stripeSessionId || attempt.state === 'creating'
    || (intentId && attempt.stripePaymentIntentId !== intentId);

  if (!needsAssociation) return checkout;

  // Concurrent recovery and webhook processing must never roll terminal state back to open.
  await attempts.updateOne({ _id: attempt._id }, { $set: {
    stripeSessionId: checkout.id, updatedAt: new Date(),
    ...(attempt.state === 'creating' ? { state: 'open' as const } : {}),
    ...(intentId ? { stripePaymentIntentId: intentId } : {}),
  } }, { session });
  return checkout;
});

const resumeAttempt = async (context: DatabaseContext, attempt: CheckoutAttempt, stripe: Stripe) => {
  if (attempt.stripeSessionId) {
    const checkout = await stripe.checkout.sessions.retrieve(attempt.stripeSessionId, { expand: ['payment_intent'] });
    await associateRecoveredCheckoutSession(context, attempt._id, checkout);
    return;
  }

  if (!attempt.active || attempt.state !== 'creating') return;

  // Stripe may prune idempotency keys after 24h. An expired original request must never create a new charge.
  if (attempt.inventoryReservation.expiresAt.getTime() <= Date.now()) {
    return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'This checkout requires recovery before another payment can begin.');
  }

  if (!attempt.stripeRequest) {
    return fail(409, 'CHECKOUT_RECOVERY_REQUIRED', 'Recover the existing provider Session before retrying this checkout.');
  }

  let checkout: Stripe.Checkout.Session;

  try {
    checkout = await stripe.checkout.sessions.create(attempt.stripeRequest.parameters, {
      idempotencyKey: attempt.stripeIdempotencyKey, apiVersion: attempt.stripeRequest.apiVersion,
    });
  } catch {
    // Even a timeout can mean a payable Session exists. Keep the reservation and exact request for safe retry.
    return fail(503, 'STRIPE_CHECKOUT_UNAVAILABLE', 'Checkout could not be opened. Retry the same checkout.');
  }

  await associateRecoveredCheckoutSession(context, attempt._id, checkout);
};

export const createCheckoutSession = async (
  context: DatabaseContext, input: z.infer<typeof checkoutSessionSchema>, stripe?: Stripe,
) => {
  const configuration = requireStripeCheckoutConfiguration();
  const client = stripe ?? createStripeClient();
  const value = checkoutSessionSchema.parse(input);
  const migration = await context.db.collection('_migrations').findOne({ name: stripeRequestMigrationName });

  if (!migration) return fail(503, 'DATABASE_NOT_READY', 'Run database migrations before opening checkout.');

  const now = Math.floor(Date.now() / 1000) * 1000;

  const reserved = await reserveOrder(context, {
    creationKeyHash: hashToken(`stripe:${value.guestToken}:${value.operationId}`),
    guestTokenHash: hashToken(value.guestToken), guestAccessExpiresAt: new Date(now + 30 * dayMilliseconds),
    expiresAt: new Date(now + 30 * 60 * 1000), checkoutMode: 'stripe', livemode: configuration.livemode,
    pricingPolicy, items: value.items,
  }, { createStripeRequest: attempt => ({ apiVersion: Stripe.API_VERSION, parameters: checkoutSessionParameters(attempt) }) });

  const attempt = await collections(context.db).attempts.findOne({ _id: reserved.attemptId });

  if (!attempt) return fail(503, 'CHECKOUT_NOT_READY', 'Checkout is not ready. Retry the same checkout.');

  await resumeAttempt(context, attempt, client);
  return { id: reserved.orderId.toHexString(), replayed: reserved.replayed };
};

export const findGuestCheckout = async (
  context: DatabaseContext, id: string, token: string, stripe?: Stripe,
): Promise<GuestCheckout | null> => {
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const { orders, attempts } = collections(context.db);

  const order = await orders.findOne({
    _id: new ObjectId(id), checkoutMode: 'stripe',
    'guestAccess.tokenHash': hashToken(token), 'guestAccess.expiresAt': { $gt: new Date() },
  });

  if (!order) return null;

  const configuration = requireStripeCheckoutConfiguration();
  const attempt = await attempts.findOne({ orderId: order._id });

  if (!attempt?.stripeSessionId) return fail(503, 'CHECKOUT_NOT_READY', 'Retry checkout from your cart.');

  const checkout = await (stripe ?? createStripeClient()).checkout.sessions.retrieve(attempt.stripeSessionId, {
    expand: ['payment_intent'],
  });

  await associateRecoveredCheckoutSession(context, attempt._id, checkout);

  const status = z.enum(['open', 'complete', 'expired']).parse(checkout.status);

  const payable = checkout.status === 'open' && attempt.active && order.orderStatus === 'open'
    && order.payment.status === 'pending' && !order.payment.settledAttemptId;

  return {
    id, status, paymentStatus: order.payment.status, publishableKey: configuration.publishableKey,
    clientSecret: payable ? checkout.client_secret : null, expiresAt: new Date(checkout.expires_at * 1000).toISOString(),
    ...(payable && attempt.livemode ? { quote: {
      currency: attempt.quoteSnapshot.currency, subtotal: attempt.quoteSnapshot.pricing.subtotal,
      items: attempt.quoteSnapshot.items.map(item => ({
        sku: item.sku, name: item.name, quantity: item.quantity, unitAmount: item.unitAmount, lineSubtotal: item.lineSubtotal,
      })),
    } } : {}),
  };
};

export const getGuestCheckout = (id: string, token?: string): Promise<GuestCheckout | null> => {
  if (!token || !/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return Promise.resolve(null);

  return withDatabase(context => findGuestCheckout(context, id, token));
};
