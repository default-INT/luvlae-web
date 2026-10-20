import type { ProductOffer } from '@/entities/product';

export interface CartItem { sku: string; quantity: number }
export type Offer = ProductOffer;
export interface PendingCheckout {
  operationId: string; guestToken: string;
  items: (CartItem & { productVersion: number })[];
  orderId?: string;
}
export const storageKey = 'luvlae-cart-v2';
export const pendingKey = 'luvlae-pending-checkout-v1';

export const parseCart = (value: unknown): CartItem[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.filter((item): item is CartItem => {
    if (!item || typeof item.sku !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(item.sku)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99 || seen.has(item.sku)) return false;

    seen.add(item.sku);
    return true;
  }).slice(0, 20).map(({ sku, quantity }) => ({ sku, quantity }));
};

export const parseOffers = (value: unknown, items: CartItem[]): Record<string, Offer> => {
  if (!value || typeof value !== 'object') return {};

  const offers: Record<string, Offer> = {};

  for (const item of items) {
    const offer = (value as Record<string, Offer>)[item.sku];

    if (offer?.sku === item.sku && typeof offer.name === 'string' && offer.name.length <= 200
      && offer.price?.currency === 'USD' && Number.isSafeInteger(offer.price.unitAmount) && offer.price.unitAmount > 0
      && Number.isSafeInteger(offer.version) && offer.version > 0
      && Number.isSafeInteger(offer.availableQuantity) && offer.availableQuantity >= 0) offers[item.sku] = offer;
  }

  return offers;
};

export const parsePending = (value: unknown): PendingCheckout | null => {
  const pending = value as PendingCheckout | null;

  if (!pending || !/^[a-f0-9-]{36}$/.test(pending.operationId) || !/^[A-Za-z0-9_-]{43}$/.test(pending.guestToken)
    || (pending.orderId !== undefined && !/^[a-f0-9]{24}$/.test(pending.orderId))
    || !Array.isArray(pending.items) || !pending.items.length || pending.items.length > 20
    || parseCart(pending.items).length !== pending.items.length
    || pending.items.some(item => !Number.isSafeInteger(item.productVersion) || item.productVersion < 1)) return null;

  return pending;
};

export const parseSettledOrders = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id)))].slice(-50)
  : [];
