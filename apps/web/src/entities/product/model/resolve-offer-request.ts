import type { ProductOffer } from './offer';

export const resolveOfferRequest = (offer: ProductOffer | null, requested: string): string => {
  if (requested !== 'best-value') return requested;

  const highlightedId = offer?.storefront?.highlightedOfferId;
  const highlighted = offer?.purchaseOffers?.find(item => item.offerId === highlightedId);
  return highlighted?.offerId ?? 'standard';
};
