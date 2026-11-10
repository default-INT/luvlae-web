import 'server-only';

import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';
import { hashToken } from '@/shared/lib/security/index.server';

import { collections } from './collections.server';
import { operationSchema } from './contracts';

import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const checkoutResolveSchema = z.strictObject({
  operationId: operationSchema, guestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

// Identity lookup only: a missing row can race an in-flight creation and must never imply safe cancellation.
export const resolveGuestCheckout = async (context: DatabaseContext, input: z.infer<typeof checkoutResolveSchema>) => {
  const value = checkoutResolveSchema.parse(input);

  const order = await collections(context.db).orders.findOne({
    creationKeyHash: hashToken(`stripe:${value.guestToken}:${value.operationId}`), checkoutMode: { $ne: 'mock' },
    'guestAccess.tokenHash': hashToken(value.guestToken), 'guestAccess.expiresAt': { $gt: new Date() },
  }, { projection: { _id: 1 } });

  if (!order) return fail(409, 'CHECKOUT_NOT_READY', 'Checkout identity is not available yet. Retry recovery.');

  return { id: order._id.toHexString() };
};
