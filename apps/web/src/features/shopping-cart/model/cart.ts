import type { ProductOffer, PurchaseOffer } from '@/entities/product';
import type { ShippingAddress } from '@/entities/order';

export interface CartItem { sku: string; offerId?: string; quantity: number }
export type Offer = ProductOffer & { offerId?: string; availableBoxes?: number };
interface PendingBase {
  operationId: string; guestToken: string;
  items: (CartItem & { productVersion: number })[];
  orderId?: string;
}
export type PendingCheckout = PendingBase & (
  { cartFormat?: undefined; shippingAddress?: never }
  | { cartFormat: 'packs-v1'; shippingAddress?: never }
  | { cartFormat: 'packs-v2'; shippingAddress: ShippingAddress }
);
export const storageKey = 'luvlae-cart-v3';
export const pendingKey = 'luvlae-pending-checkout-v1';
export const cartKey = (item: Pick<CartItem, 'sku' | 'offerId'>) => `${item.sku}:${item.offerId ?? 'standard'}`;

const validOfferId = (id: unknown) => id === 'standard' || (typeof id === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

export const selectPurchaseOffer = (offers: PurchaseOffer[], requested: string | string[] | undefined) => {
  const id = requested === undefined ? 'standard' : requested;
  const matched = typeof id === 'string' ? offers.find(offer => offer.offerId === id) : undefined;
  return { selected: matched ?? offers.find(offer => offer.offerId === 'standard'), invalid: !matched };
};

export const toCartOffer = (product: ProductOffer, offer: PurchaseOffer): Offer => ({
  ...product, offerId: offer.offerId, price: offer.price, unitsPerPack: offer.unitsPerPack,
  patchesPerPack: offer.patchesPerPack, availableQuantity: offer.availableQuantity, availableBoxes: product.availableQuantity,
});

export const parseCart = (value: unknown): CartItem[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value.filter((item): item is CartItem => {
    if (!item || typeof item.sku !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(item.sku)
      || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99
      || (item.offerId !== undefined && !validOfferId(item.offerId)) || seen.has(cartKey(item))) return false;

    seen.add(cartKey(item));
    return true;
  }).slice(0, 20).map(({ sku, offerId, quantity }) => ({ sku, offerId: offerId ?? 'standard', quantity }));
};

export const parseOffers = (value: unknown, items: CartItem[]): Record<string, Offer> => {
  if (!value || typeof value !== 'object') return {};

  const offers: Record<string, Offer> = {};

  for (const item of items) {
    const key = cartKey(item);

    const offer = (value as Record<string, Offer>)[key]
      ?? (item.offerId === 'standard' || !item.offerId ? (value as Record<string, Offer>)[item.sku] : undefined);

    const units = offer?.unitsPerPack ?? 1;

    if (offer?.sku === item.sku && (offer.offerId === undefined || offer.offerId === (item.offerId ?? 'standard'))
      && ((item.offerId ?? 'standard') === 'standard' || offer.unitsPerPack !== undefined)
      && typeof offer.name === 'string' && offer.name.length <= 200
      && offer.price?.currency === 'USD' && Number.isSafeInteger(offer.price.unitAmount) && offer.price.unitAmount > 0
      && Number.isSafeInteger(offer.version) && offer.version > 0 && Number.isSafeInteger(units) && units >= 1 && units <= 99
      && Number.isSafeInteger(offer.availableQuantity) && offer.availableQuantity >= 0) {
      offers[key] = { ...offer, offerId: item.offerId ?? 'standard', unitsPerPack: units, patchesPerPack: units * 60 };
    }
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

  if (pending.cartFormat !== undefined && pending.cartFormat !== 'packs-v1' && pending.cartFormat !== 'packs-v2') return null;

  if (pending.cartFormat && pending.items.some(item => !validOfferId(item.offerId))) return null;

  if (pending.cartFormat === 'packs-v2') {
    const address = pending.shippingAddress;

    if (!address || address.country !== 'US'
      || ['recipientName', 'line1', 'city', 'state', 'postalCode'].some(key =>
        typeof address[key as keyof ShippingAddress] !== 'string' || !address[key as keyof ShippingAddress]?.trim())) return null;
  }

  // Return the original object: old pending fingerprints must not gain pack/address/default fields.
  return pending;
};

export const pendingRequest = (pending: PendingCheckout) => {
  const { orderId: _orderId, ...body } = pending;
  return body;
};

export const parseSettledOrders = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === 'string' && /^[a-f0-9]{24}$/.test(id)))].slice(-50)
  : [];
