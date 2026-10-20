import 'server-only';

import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';
import { matchesStripeMode } from '@/shared/lib/stripe/index.server';

import type Stripe from 'stripe';
import type { CheckoutAttempt, Order } from './models';

export interface CheckoutContext {
  checkout: Stripe.Checkout.Session;
  attempt: CheckoutAttempt;
  order: Order;
  intent: Stripe.PaymentIntent | null;
  intentId?: string;
}

export interface CheckoutTransition {
  state: CheckoutAttempt['state'];
  terminal: boolean;
  inventory: 'commit' | 'release' | 'hold';
  paymentStatus?: Order['payment']['status'];
  pricing?: Order['pricing'] & { total: number };
  contacts?: Pick<Order, 'customer' | 'shippingAddress'>;
  reconciliationRequired: boolean;
  observation?: { status: 'succeeded' | 'failed'; amount: number };
}

const associationError = () => fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'Checkout references do not match the order.');
const amountError = () => fail(409, 'PAYMENT_AMOUNT_MISMATCH', 'Stripe amounts do not match the finalized server quote.');
const allMatch = (rules: Record<string, boolean>) => Object.values(rules).every(Boolean);

export const validateCheckoutSession = (checkout: Stripe.Checkout.Session, objectId: string) => {
  const valid = allMatch({
    session: checkout.id === objectId,
    environment: matchesStripeMode(checkout.livemode),
    paymentMode: checkout.mode === 'payment',
  });

  if (!valid) fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'Checkout environment or mode does not match.');
};

export const validateCheckoutAssociation = (
  checkout: Stripe.Checkout.Session, attempt: CheckoutAttempt, order: Order | null,
): CheckoutContext => {
  if (!order) return associationError();

  const intent = typeof checkout.payment_intent === 'object' ? checkout.payment_intent : null;
  const intentId = typeof checkout.payment_intent === 'string' ? checkout.payment_intent : intent?.id;

  const valid = allMatch({
    stripeOrder: order.checkoutMode !== 'mock',
    attemptEnvironment: matchesStripeMode(attempt.livemode),
    sessionEnvironment: matchesStripeMode(checkout.livemode),
    orderMetadata: checkout.metadata?.orderId === order._id.toHexString(),
    attemptMetadata: checkout.metadata?.attemptId === attempt._id.toHexString(),
    clientReference: checkout.client_reference_id === order._id.toHexString(),
    currency: checkout.currency === 'usd',
    intentEnvironment: !intent || matchesStripeMode(intent.livemode),
    intentCurrency: !intent || intent.currency === 'usd',
    intentReference: !attempt.stripePaymentIntentId || attempt.stripePaymentIntentId === intentId,
  });

  if (!valid) return associationError();

  return { checkout, attempt, order, intent, intentId };
};

const validatePaidAmounts = ({ checkout, attempt, order, intent }: CheckoutContext) => {
  const { pricing, currency } = attempt.quoteSnapshot;
  const amounts = [pricing.subtotal, pricing.discount, pricing.shipping, pricing.tax, pricing.total];
  const validAmounts = amounts.every(value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);

  if (!validAmounts || pricing.total === null || pricing.shipping === null || pricing.tax === null) return amountError();

  const valid = allMatch({
    finalQuote: pricing.state === 'final',
    quoteTotal: pricing.total === pricing.subtotal - pricing.discount + pricing.shipping + pricing.tax,
    quoteCurrency: currency === order.currency,
    sessionCurrency: checkout.currency === 'usd',
    subtotal: checkout.amount_subtotal === pricing.subtotal,
    total: checkout.amount_total === pricing.total,
    discount: checkout.total_details?.amount_discount === pricing.discount,
    shipping: checkout.total_details?.amount_shipping === pricing.shipping,
    tax: checkout.total_details?.amount_tax === pricing.tax,
    paidIntent: intent?.status === 'succeeded',
    intentEnvironment: !!intent && matchesStripeMode(intent.livemode),
    intentCurrency: intent?.currency === 'usd',
    intentAmount: intent?.amount === pricing.total,
    receivedAmount: intent?.amount_received === pricing.total,
  });

  if (!valid) return amountError();

  return { ...pricing, total: pricing.total };
};

const contactsSchema = z.object({
  customer: z.object({ email: z.string().min(1), name: z.string().min(1), phone: z.string().optional() }),
  shippingAddress: z.object({
    recipientName: z.string().min(1), line1: z.string().min(1), line2: z.string().optional(),
    city: z.string().min(1), state: z.string().min(1), postalCode: z.string().min(1), country: z.literal('US'),
  }),
});

const readContacts = (checkout: Stripe.Checkout.Session): CheckoutTransition['contacts'] => {
  const customer = checkout.customer_details;
  const shipping = checkout.collected_information?.shipping_details;
  const address = shipping?.address;

  const result = contactsSchema.safeParse({
    customer: { email: customer?.email, name: customer?.name, ...(customer?.phone ? { phone: customer.phone } : {}) },
    shippingAddress: {
      recipientName: shipping?.name, line1: address?.line1, city: address?.city, state: address?.state,
      postalCode: address?.postal_code, country: address?.country, ...(address?.line2 ? { line2: address.line2 } : {}),
    },
  });

  return result.success ? result.data : undefined;
};

type Outcome = 'paid' | 'expired' | 'failed' | 'processing' | 'unchanged';

const determineOutcome = ({ checkout, intent }: CheckoutContext, eventType: string): Outcome => {
  const complete = checkout.status === 'complete';
  const unpaid = checkout.payment_status === 'unpaid';

  const asyncFailure = allMatch({
    failureEvent: eventType === 'checkout.session.async_payment_failed',
    complete, unpaid,
    failedIntent: ['requires_payment_method', 'canceled'].includes(intent?.status ?? ''),
  });

  const rules: { matches: boolean; outcome: Outcome }[] = [
    { matches: complete && checkout.payment_status === 'paid', outcome: 'paid' },
    { matches: checkout.status === 'expired' && unpaid, outcome: 'expired' },
    { matches: asyncFailure, outcome: 'failed' },
    { matches: complete, outcome: 'processing' },
  ];

  return rules.find(rule => rule.matches)?.outcome ?? 'unchanged';
};

const transitions = {
  paid: { state: 'succeeded', terminal: true, inventory: 'commit', paymentStatus: 'paid' },
  expired: { state: 'expired', terminal: true, inventory: 'release', paymentStatus: 'expired' },
  failed: { state: 'failed', terminal: true, inventory: 'release', paymentStatus: 'failed' },
  processing: { state: 'processing', terminal: false, inventory: 'hold', paymentStatus: 'processing' },
} as const satisfies Record<
  Exclude<Outcome, 'unchanged'>, Pick<CheckoutTransition, 'state' | 'terminal' | 'inventory' | 'paymentStatus'>
>;

export const planCheckoutTransition = (context: CheckoutContext, eventType: string): CheckoutTransition | undefined => {
  const { attempt, order } = context;
  const outcome = determineOutcome(context, eventType);
  const paid = outcome === 'paid';
  const settled = attempt.state === 'succeeded' || order.payment.settledAttemptId?.equals(attempt._id);

  if (settled) return undefined;

  if (order.payment.settledAttemptId) {
    return fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'A different attempt already settled this order.');
  }

  if (!attempt.active && !paid) return undefined;

  const activeAttempt = order.payment.activeAttemptId?.equals(attempt._id);
  const latePayment = paid && !order.payment.activeAttemptId && attempt.inventoryReservation.state === 'released';

  if (!activeAttempt && !latePayment) {
    return fail(409, 'PAYMENT_ASSOCIATION_MISMATCH', 'The order has a different active payment attempt.');
  }

  const transition: Omit<CheckoutTransition, 'reconciliationRequired'> = outcome === 'unchanged'
    ? {
      state: attempt.state, terminal: false, inventory: 'hold',
      paymentStatus: attempt.state === 'processing' ? 'processing' : undefined,
    }
    : transitions[outcome];

  const pricing = paid ? validatePaidAmounts(context) : undefined;
  const contacts = paid ? readContacts(context.checkout) : undefined;
  const releasedPayment = paid && attempt.inventoryReservation.state === 'released';

  return {
    ...transition, pricing, contacts,
    reconciliationRequired: [
      order.payment.reconciliationRequired, order.orderStatus !== 'open', releasedPayment, paid && !contacts,
    ].some(Boolean),
    ...(pricing ? { observation: { status: 'succeeded', amount: pricing.total } } : {}),
    ...(outcome === 'failed' ? { observation: { status: 'failed', amount: 0 } } : {}),
  };
};
