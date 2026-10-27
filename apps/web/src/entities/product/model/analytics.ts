import type { ProductOffer } from './offer';
import type { EcommerceParameters } from '@/shared/lib/analytics';

export const getProductAnalytics = (offer: ProductOffer, quantity = 1): EcommerceParameters => ({
  currency: offer.price.currency,
  value: offer.price.unitAmount * quantity / 100,
  items: [{ item_id: offer.sku, item_name: offer.name, price: offer.price.unitAmount / 100, quantity }],
});
