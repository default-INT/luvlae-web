export interface ProductOffer {
  id: string; sku: string; name: string; shortDescription: string;
  price: { currency: 'USD'; unitAmount: number };
  availableQuantity: number; salesEnabled: boolean; version: number;
}
