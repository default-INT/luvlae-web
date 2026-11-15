import { getAdminProduct, patchProduct } from '@/_app/commerce/handlers.server';
import { withStorefrontRevalidation } from '@/_app/commerce/storefront-cache.server';

export const dynamic = 'force-dynamic';

export const GET = getAdminProduct;
export const PATCH = withStorefrontRevalidation(patchProduct);
