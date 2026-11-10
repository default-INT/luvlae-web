import 'server-only';

import type Stripe from 'stripe';
import type { CheckoutAttempt } from './models';

export const hasFrozenInclusiveTax = (attempt: CheckoutAttempt) => {
  const parameters = attempt.stripeRequest?.parameters;
  return parameters?.automatic_tax?.enabled === true && Boolean(parameters.line_items?.length)
    && parameters!.line_items!.every(item => item.price_data?.tax_behavior === 'inclusive');
};

export const validObservedTax = (attempt: CheckoutAttempt, checkout: Stripe.Checkout.Session) => {
  const tax = checkout.total_details?.amount_tax;
  return hasFrozenInclusiveTax(attempt)
    ? Number.isSafeInteger(tax) && tax! >= 0 && tax! <= attempt.quoteSnapshot.pricing.subtotal
    : tax === attempt.quoteSnapshot.pricing.tax;
};
