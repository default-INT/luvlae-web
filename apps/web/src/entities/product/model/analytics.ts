import { product } from './product';

import type { ProductOffer, PurchaseOffer } from './offer';
import type { EcommerceParameters, ItemListParameters } from '@/shared/lib/analytics';

export const getProductAnalytics = (offer: ProductOffer, quantity = 1, initialOfferId = 'standard'): EcommerceParameters => {
  const selected = offer.purchaseOffers?.find(item => item.offerId === initialOfferId)
    ?? offer.purchaseOffers?.find(item => item.offerId === 'standard');

  const price = selected?.price ?? offer.price;

  return {
    currency: price.currency,
    value: price.unitAmount * quantity / 100,
    items: [{ item_id: offer.sku, item_name: offer.name, item_variant: selected?.offerId ?? 'standard',
      price: price.unitAmount / 100, quantity }],
  };
};

export const getHomeOfferListAnalytics = (offers: PurchaseOffer[]): ItemListParameters => ({
  item_list_id: 'home_purchase_offers', item_list_name: 'Home purchase offers', currency: 'USD',
  items: offers.slice(0, 3).map((offer, index) => ({ item_id: product.sku,
    item_name: `${product.name} — ${offer.unitsPerPack}-Pack`, item_variant: offer.offerId,
    price: offer.price.unitAmount / 100, quantity: 1, index })),
});
