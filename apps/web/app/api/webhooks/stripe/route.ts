import { stripeWebhook } from '@/_app/commerce/stripe-webhook.server';
import { withStorefrontRevalidation } from '@/_app/commerce/storefront-cache.server';

export const dynamic = 'force-dynamic';

export const POST = withStorefrontRevalidation(stripeWebhook);
