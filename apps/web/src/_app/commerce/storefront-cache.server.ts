import 'server-only';

import { revalidatePath } from 'next/cache';

// Pages whose HTML embeds the live offer (price, packs, availability, Product JSON-LD).
const storefrontPaths = ['/', '/products/berberine-patches'];

/** Purge edge-cached storefront HTML so the next request renders the current offer. */
export const revalidateStorefront = async () => {
  try {
    await Promise.all(storefrontPaths.map(path => revalidatePath(path)));
  } catch (error) {
    // The write already committed; the route TTL bounds staleness if the purge fails.
    console.error('[storefront-cache] purge failed', error);
  }
};

/** Wrap a mutating route so a successful response purges storefront HTML. */
export const withStorefrontRevalidation = <Args extends unknown[]>(handler: (...args: Args) => Promise<Response>) =>
  async (...args: Args) => {
    const response = await handler(...args);

    if (response.ok) await revalidateStorefront();

    return response;
  };
