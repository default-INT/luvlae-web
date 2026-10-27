import { siteUrl } from '@/shared/config/site';

import type { ProductOffer } from './offer';

export const getOfferSchema = (offer: ProductOffer | null, path: string) => {
  if (!offer || !offer.salesEnabled || offer.price.currency !== 'USD'
    || !Number.isSafeInteger(offer.price.unitAmount) || offer.price.unitAmount <= 0) return undefined;

  return {
    '@type': 'Offer',
    url: siteUrl(path),
    price: (offer.price.unitAmount / 100).toFixed(2),
    priceCurrency: offer.price.currency,
    availability: `https://schema.org/${offer.availableQuantity > 0 ? 'InStock' : 'OutOfStock'}`,
    seller: { '@type': 'Organization', '@id': siteUrl('/#organization'), name: 'Luvlae', url: siteUrl() },
  };
};
