import assert from 'node:assert/strict';

import type Stripe from 'stripe';

export const syntheticShipping = { recipientName: 'Synthetic Buyer', line1: '123 Synthetic Street', city: 'Test City',
  state: 'NY' as const, postalCode: '10001', country: 'US' as const };
export const withShipping = (input: {
  operationId: string; guestToken: string;
  items: { sku: string; quantity: number; productVersion: number; offerId?: string }[];
}) => ({ operationId: input.operationId, guestToken: input.guestToken,
  cartFormat: 'packs-v2' as const, shippingAddress: syntheticShipping,
  items: input.items.map(item => ({ ...item, offerId: item.offerId ?? 'standard' })) });

export const stubShippingCustomers = (stripe: Stripe) => {
  const customers = new Map<string, Stripe.Customer>();

  stripe.customers.create = async (parameters, options) => {
    assert.ok(parameters && options?.idempotencyKey);

    const customer = customers.get(options.idempotencyKey) ?? { id: `cus_${options.idempotencyKey}`, object: 'customer',
      metadata: parameters.metadata, shipping: parameters.shipping, livemode: false } as Stripe.Customer;

    customers.set(options.idempotencyKey, customer);
    return customer as Stripe.Response<Stripe.Customer>;
  };
};
