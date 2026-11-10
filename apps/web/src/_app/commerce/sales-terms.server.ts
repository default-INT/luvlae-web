import 'server-only';

import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';

import type { Order } from './models';

const configuration = z.strictObject({
  policyVersion: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/),
  effectiveAt: z.iso.datetime({ offset: true }),
});

// Activation is an explicit operational decision; no date is inferred from a deploy.
export const readActiveSalesTerms = (
  now: Date,
  environment: Record<string, string | undefined> = process.env,
): Order['salesTerms'] => {
  const policyVersion = environment.SALES_TERMS_POLICY_VERSION ?? '';
  const effectiveAt = environment.SALES_TERMS_EFFECTIVE_AT ?? '';

  if (!policyVersion && !effectiveAt) return undefined;

  const parsed = configuration.safeParse({ policyVersion, effectiveAt });

  if (!parsed.success) return fail(503, 'SALES_TERMS_CONFIGURATION', 'Sales terms configuration is invalid.');

  const date = new Date(parsed.data.effectiveAt);

  return date.getTime() <= now.getTime() ? { policyVersion: parsed.data.policyVersion, effectiveAt: date } : undefined;
};
