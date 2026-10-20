import 'server-only';

import Stripe from 'stripe';

import { fail } from '@/shared/lib/api/index.server';

export const getStripeMode = (): 'test' | 'live' => {
  const mode = process.env.STRIPE_MODE ?? 'test';

  if (!['test', 'live'].includes(mode)) {
    return fail(503, 'STRIPE_NOT_CONFIGURED', 'Stripe mode must be test or live.');
  }

  const production = process.env.NEXT_PUBLIC_APP_ENV === 'production';
  const productionRuntime = production && process.env.APP_ENV === 'production';

  if (mode === 'live' && !productionRuntime) {
    return fail(503, 'STRIPE_NOT_CONFIGURED', 'Live payments require the production environment.');
  }

  return mode as 'test' | 'live';
};

export const matchesStripeMode = (livemode: boolean) => livemode === (getStripeMode() === 'live');

const requireStripeSecretKey = () => {
  const mode = getStripeMode();
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key?.startsWith(`sk_${mode}_`)) {
    return fail(503, 'STRIPE_NOT_CONFIGURED', 'A Stripe secret API key matching the configured mode is required.');
  }

  return key;
};

const requireStripeWebhookSecret = () => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret?.startsWith('whsec_')) {
    return fail(503, 'STRIPE_NOT_CONFIGURED', 'The Stripe webhook signing secret is required.');
  }

  return secret;
};

export const requireStripeCheckoutConfiguration = () => {
  if (process.env.STRIPE_CHEKOUT_DISABLED === 'true') {
    return fail(503, 'CHECKOUT_UNAVAILABLE', 'Checkout is temporarily unavailable.');
  }

  const mode = getStripeMode();
  requireStripeSecretKey();
  requireStripeWebhookSecret();
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!publishableKey?.startsWith(`pk_${mode}_`)) {
    return fail(503, 'STRIPE_NOT_CONFIGURED', 'A Stripe publishable key matching the configured mode is required.');
  }

  return { mode, livemode: mode === 'live', publishableKey };
};

export const validateStripeEventEnvironment = (event: Pick<Stripe.Event, 'livemode' | 'account'>) => {
  const valid = matchesStripeMode(event.livemode) && !event.account;

  if (!valid) {
    fail(400, 'STRIPE_ENVIRONMENT_MISMATCH', 'Stripe event does not match this account and configured mode.');
  }
};

export const createStripeClient = () => {
  const key = requireStripeSecretKey();

  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 1, timeout: 5000,
  });
};

export const verifyStripeEvent = async (request: Request, stripe: Stripe) => {
  const secret = requireStripeWebhookSecret();
  const signature = request.headers.get('stripe-signature');

  if (!signature) return fail(400, 'INVALID_STRIPE_SIGNATURE', 'A valid Stripe signature is required.');

  const reader = request.body?.getReader();

  if (!reader) return fail(400, 'INVALID_STRIPE_EVENT', 'An event body is required.');

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      size += value.byteLength;

      if (size > 262144) {
        await reader.cancel();
        fail(413, 'BODY_TOO_LARGE', 'Webhook body exceeds 256 KiB.');
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      bytes, signature, secret, 300, Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return fail(400, 'INVALID_STRIPE_SIGNATURE', 'A valid Stripe signature and event body are required.');
  }

  if (!event.id || !event.type || !Number.isSafeInteger(event.created) || !event.data?.object) {
    return fail(400, 'INVALID_STRIPE_EVENT', 'Invalid Stripe event.');
  }

  validateStripeEventEnvironment(event);
  return event;
};
