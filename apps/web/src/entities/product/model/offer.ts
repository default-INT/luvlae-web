export interface ProductOffer {
  purchaseOffers?: PurchaseOffer[];
  storefront?: ProductStorefront;
  id: string; sku: string; name: string; shortDescription: string;
  price: { currency: 'USD'; unitAmount: number };
  availableQuantity: number; salesEnabled: boolean; version: number;
  unitsPerPack?: number; patchesPerPack?: number;
  status?: 'draft' | 'active' | 'archived'; sortOrder?: number;
}

export interface ProductOfferSnapshot {
  id: string;
  unitsPerPack: number;
  price: { currency: 'USD'; unitAmount: number };
  status: 'draft' | 'active' | 'archived';
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOffer {
  offerId: string;
  unitsPerPack: number;
  patchesPerPack: number;
  price: { currency: 'USD'; unitAmount: number };
  availableQuantity: number;
  sortOrder: number;
}

export interface ProductStorefront {
  homeOfferIds: string[];
  highlightedOfferId: string | null;
  highlightBadge: 'bestValue' | 'recommended';
}
