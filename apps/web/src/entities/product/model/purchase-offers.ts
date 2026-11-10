export const publicOffers = (product: {
  price: { currency: 'USD'; unitAmount: number }; salesEnabled: boolean;
  inventory: { stockQuantity: number; reservedQuantity: number };
  offers?: { id: string; unitsPerPack: number;
    price: { currency: 'USD'; unitAmount: number }; status: string; sortOrder: number }[];
}) => {
  const availableBoxes = product.inventory.stockQuantity - product.inventory.reservedQuantity;
  return [
    { id: 'standard', unitsPerPack: 1, price: product.price, sortOrder: 0 },
    ...(product.offers ?? []).filter(offer => offer.status === 'active')
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
      .map(({ id, unitsPerPack, price, sortOrder }) => ({ id, unitsPerPack, price, sortOrder })),
  ].map(offer => ({ ...offer, patchesPerPack: offer.unitsPerPack * 60,
    availableQuantity: product.salesEnabled ? Math.floor(availableBoxes / offer.unitsPerPack) : 0 }));
};

export const publicStorefront = (product: Parameters<typeof publicOffers>[0] & {
  storefront?: { homeOfferIds: string[]; highlightedOfferId: string | null; highlightBadge: 'bestValue' | 'recommended' };
}) => {
  if (!product.storefront) return undefined;

  const availableIds = new Set(publicOffers(product).map(offer => offer.id));
  const homeOfferIds = [...new Set(product.storefront.homeOfferIds)].filter(id => availableIds.has(id)).slice(0, 3);
  return { homeOfferIds, highlightBadge: product.storefront.highlightBadge,
    highlightedOfferId: homeOfferIds.includes(product.storefront.highlightedOfferId ?? '')
      ? product.storefront.highlightedOfferId : null };
};
