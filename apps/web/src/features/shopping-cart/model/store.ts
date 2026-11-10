import { createStore } from 'zustand/vanilla';

import { getProductAnalytics } from '@/entities/product';
import { trackEcommerceEvent } from '@/shared/lib/analytics';

import { commerceRequest } from '../api/commerce';

import { cartKey, parseCart, parseOffers, pendingKey, pendingRequest, storageKey, toCartOffer } from './cart';

import type { CartItem, Offer, PendingCheckout } from './cart';
import type { ShippingAddress } from '@/entities/order';
import type { Dictionary } from '@/shared/config/i18n';

interface CartState {
  items: CartItem[]; offers: Record<string, Offer>; offerErrors: Record<string, string>;
  settledOrders: string[]; ready: boolean; open: boolean; busy: boolean; cancelling: boolean;
  pending: PendingCheckout | null; error: string;
  restore: (items: CartItem[], offers: Record<string, Offer>, pending: PendingCheckout | null, settledOrders?: string[]) => void;
  setOpen: (open: boolean) => void;
  add: (offer: Offer, quantity: number) => boolean;
  update: (sku: string, quantity: number, offerId?: string) => void;
  replaceOffer: (sku: string, sourceOfferId: string, destination: Offer) => boolean;
  remove: (sku: string, offerId?: string) => void;
  checkout: (copy: Dictionary['commerce'], address?: ShippingAddress) => Promise<string | null>;
  cancelCheckout: (copy: Dictionary['commerce']) => Promise<boolean>;
  confirmPaidOrder: (id: string, purchased: CartItem[]) => void;
  releaseExpiredCheckout: (id: string) => void;
}
interface Dependencies {
  request?: typeof commerceRequest;
  session?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  persistent?: () => Pick<Storage, 'setItem'>;
}

const cartAnalytics = (offer: Offer, quantity: number) => {
  const result = getProductAnalytics(offer, quantity, offer.offerId ?? 'standard');
  return { ...result, items: result.items?.map(item => ({ ...item, item_variant: offer.offerId ?? 'standard' })) };
};

const trackCartView = (items: CartItem[], offers: Record<string, Offer>) => {
  if (!items.length || items.some(item => !offers[cartKey(item)])) return;

  trackEcommerceEvent('view_cart', {
    currency: 'USD',
    value: items.reduce((sum, item) => sum + offers[cartKey(item)].price.unitAmount * item.quantity, 0) / 100,
    items: items.flatMap(item => cartAnalytics(offers[cartKey(item)], item.quantity).items ?? []),
  });
};

// Never contains server request data. Each SSR consumer receives a fresh empty store.
export const createCartStore = (dependencies: Dependencies = {}) => {
  const request = dependencies.request ?? commerceRequest;
  const session = dependencies.session ?? (() => sessionStorage);
  const persistent = dependencies.persistent ?? (() => localStorage);

  return createStore<CartState>()((set, get) => ({
    items: [], offers: {}, offerErrors: {}, settledOrders: [], ready: false, open: false, busy: false,
    cancelling: false, pending: null, error: '',
    restore: (items, offers, pending, settledOrders = []) => {
      const normalized = parseCart(items);
      set({ items: normalized, offers: parseOffers(offers, normalized), pending, settledOrders, ready: true });
    },
    setOpen: open => {
      const state = get();
      set({ open });

      if (open && !state.open) trackCartView(state.items, state.offers);
    },
    add: (offer, quantity) => {
      const state = get();

      if (state.busy || state.pending || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return false;

      const key = cartKey(offer);
      const current = state.offers[key];
      const latest = current && current.version > offer.version ? current : offer;
      const existing = state.items.find(item => cartKey(item) === key);
      const next = quantity + (existing?.quantity ?? 0);

      const items = existing ? state.items.map(item => cartKey(item) === key ? { ...item, quantity: next } : item)
        : [...state.items, { sku: offer.sku, offerId: offer.offerId ?? 'standard', quantity }];

      const offers = { ...state.offers, [key]: latest };

      const boxes = items.filter(item => item.sku === offer.sku).reduce((sum, item) =>
        sum + item.quantity * (offers[cartKey(item)]?.unitsPerPack ?? 1), 0);

      const stock = latest.availableBoxes ?? latest.availableQuantity * (latest.unitsPerPack ?? 1);

      if (!latest.salesEnabled || next > latest.availableQuantity || next > 99 || boxes > Math.min(99, stock)
        || (!existing && state.items.length >= 20)) { set({ error: 'CART_LIMIT' }); return false; }

      set({ items, offers, open: true, error: '' });
      trackEcommerceEvent('add_to_cart', cartAnalytics(latest, quantity));

      if (!state.open) trackCartView(items, offers);

      return true;
    },
    update: (sku, quantity, offerId = 'standard') => {
      const state = get();

      if (state.busy || state.pending || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;

      const key = cartKey({ sku, offerId });
      const previous = state.items.find(item => cartKey(item) === key)?.quantity;
      const latest = state.offers[key];
      const items = state.items.map(item => cartKey(item) === key ? { ...item, quantity } : item);

      const boxes = items.filter(item => item.sku === sku).reduce((sum, item) =>
        sum + item.quantity * (state.offers[cartKey(item)]?.unitsPerPack ?? 1), 0);

      const stock = latest?.availableBoxes ?? (latest ? latest.availableQuantity * (latest.unitsPerPack ?? 1) : 99);

      if (quantity > (latest?.availableQuantity ?? 99) || boxes > Math.min(99, stock)) { set({ error: 'CART_LIMIT' }); return; }

      set({ items, error: '' });

      if (previous && previous !== quantity && latest) {
        trackEcommerceEvent(quantity > previous ? 'add_to_cart' : 'remove_from_cart',
          cartAnalytics(latest, Math.abs(quantity - previous)));
      }
    },
    replaceOffer: (sku, sourceOfferId, destination) => {
      const state = get();
      const sourceKey = cartKey({ sku, offerId: sourceOfferId });
      const destinationKey = cartKey(destination);
      const source = state.items.find(item => cartKey(item) === sourceKey);

      if (state.busy || state.pending || !source || destination.sku !== sku) return false;

      if (sourceKey === destinationKey) return true;

      const existing = state.items.find(item => cartKey(item) === destinationKey);
      const quantity = source.quantity + (existing?.quantity ?? 0);
      const current = state.offers[destinationKey];
      const latest = current && current.version > destination.version ? current : destination;
      const offers = { ...state.offers, [destinationKey]: latest };
      const items = state.items.filter(item => cartKey(item) !== sourceKey && cartKey(item) !== destinationKey);
      items.push({ sku, offerId: destination.offerId ?? 'standard', quantity });

      const boxes = items.filter(item => item.sku === sku).reduce((sum, item) =>
        sum + item.quantity * (offers[cartKey(item)]?.unitsPerPack ?? 1), 0);

      const stock = latest.availableBoxes ?? latest.availableQuantity * (latest.unitsPerPack ?? 1);

      if (!latest.salesEnabled || quantity > latest.availableQuantity || quantity > 99 || boxes > Math.min(99, stock)) {
        set({ error: 'CART_LIMIT' });
        return false;
      }

      const offerErrors = { ...state.offerErrors };
      delete offerErrors[sourceKey];
      delete offerErrors[destinationKey];
      set({ items, offers, offerErrors, error: '' });
      return true;
    },
    remove: (sku, offerId = 'standard') => {
      const state = get();

      if (state.busy || state.pending) return;

      const key = cartKey({ sku, offerId });
      const removed = state.items.find(item => cartKey(item) === key);
      set({ items: state.items.filter(item => cartKey(item) !== key), error: '' });

      if (removed && state.offers[key]) {
        trackEcommerceEvent('remove_from_cart', cartAnalytics(state.offers[key], removed.quantity));
      }
    },
    confirmPaidOrder: (id, purchased) => {
      const state = get();

      if (!state.ready || state.pending?.orderId !== id) return;

      const alreadySettled = state.settledOrders.includes(id);

      const items = alreadySettled ? state.items : state.items.flatMap(item => {
        const count = purchased.find(value => cartKey(value) === cartKey(item))?.quantity ?? 0;
        return item.quantity > count ? [{ ...item, quantity: item.quantity - count }] : [];
      });

      const settledOrders = alreadySettled ? state.settledOrders : [...state.settledOrders, id].slice(-50);
      // Persist the quantities and receipt in one record before forgetting the exact request.
      // If storage is blocked, leave the request available for recovery after a reload.
      let persisted = false;

      try {
        persistent().setItem(storageKey, JSON.stringify({ items, offers: state.offers, settledOrders }));
        persisted = true;
        session().removeItem(pendingKey);
      } catch { /* The in-memory receipt still prevents repeated cleanup during this visit. */ }

      set({ items, settledOrders, ...(persisted ? { pending: null } : {}) });
    },
    releaseExpiredCheckout: id => {
      if (get().pending?.orderId !== id) return;

      try { session().removeItem(pendingKey); }
      catch { /* Keep the exact request locked if browser storage cannot record its release. */ return; }

      set({ pending: null, error: '' });
    },
    cancelCheckout: async copy => {
      const state = get();

      if (state.busy) return false;

      if (!state.pending) return true;

      set({ busy: true, cancelling: true, error: '' });

      try {
        let pending = state.pending;

        const replay = async () => {
          const result = await request<{ id: string }>('/api/checkout/session', pendingRequest(pending));
          pending = { ...pending, orderId: result.id };
          session().setItem(pendingKey, JSON.stringify(pending));
          set({ pending });
        };

        if (!pending.orderId) {
          try {
            const result = await request<{ id: string }>('/api/checkout/resolve', {
              operationId: pending.operationId, guestToken: pending.guestToken,
            });

            pending = { ...pending, orderId: result.id };
            session().setItem(pendingKey, JSON.stringify(pending));
            set({ pending });
          } catch (failure) {
            if (pending.cartFormat === 'packs-v2' || !(failure instanceof Error)
              || failure.message !== 'CHECKOUT_NOT_READY') throw failure;

            await replay();
          }
        }

        try {
          await request(`/api/orders/${pending.orderId}/checkout/cancel`, {}, pending.guestToken);
        } catch (failure) {
          if (!(failure instanceof Error) || failure.message !== 'CHECKOUT_NOT_READY') throw failure;

          await replay();
          await request(`/api/orders/${pending.orderId}/checkout/cancel`, {}, pending.guestToken);
        }

        session().removeItem(pendingKey);
        set({ pending: null });
        return true;
      } catch (failure) {
        const code = failure instanceof Error ? failure.message : '';

        if (code === 'CHECKOUT_RELOAD_REQUIRED') {
          try { session().removeItem(pendingKey); }
          catch { set({ error: copy.cancelCheckoutError }); return false; }

          set({ pending: null, error: '' });
          return true;
        }

        set({ error: code === 'CHECKOUT_CANNOT_CANCEL' ? copy.checkoutCannotCancel : copy.cancelCheckoutError });
        return false;
      } finally {
        set({ busy: false, cancelling: false });
      }
    },
    checkout: async (copy, address) => {
      const state = get();

      if (state.busy || (!state.items.length && !state.pending)) return null;

      if (!state.pending && !address) { set({ error: copy.shippingAddressRequired }); return null; }

      set({ busy: true, error: '' });

      try {
        let attempt = state.pending;

        if (!attempt) {
          const products = new Map<string, Offer>();
          await Promise.all([...new Set(state.items.map(item => item.sku))].map(async sku => {
            products.set(sku, await request<Offer>(`/api/products/${sku}`));
          }));
          const fresh: Record<string, Offer> = {};
          const errors: Record<string, string> = {};

          for (const item of state.items) {
            const product = products.get(item.sku)!;

            const selected = product.purchaseOffers?.find(offer => offer.offerId === (item.offerId ?? 'standard'))
              ?? (!product.purchaseOffers && (item.offerId ?? 'standard') === 'standard' ? {
                offerId: 'standard', unitsPerPack: 1, patchesPerPack: 60, price: product.price,
                availableQuantity: product.availableQuantity, sortOrder: 0,
              } : undefined);

            if (!selected) { errors[cartKey(item)] = copy.offerError; continue; }

            fresh[cartKey(item)] = toCartOffer(product, selected);
          }

          set({ offers: { ...state.offers, ...fresh }, offerErrors: errors });

          if (Object.keys(errors).length) throw new Error('PRODUCT_UNAVAILABLE');

          if (state.items.some(item => item.quantity > fresh[cartKey(item)].availableQuantity)) throw new Error('OUT_OF_STOCK');

          if (state.items.some(item => state.offers[cartKey(item)]?.price.unitAmount !== fresh[cartKey(item)].price.unitAmount
            || state.offers[cartKey(item)]?.version !== fresh[cartKey(item)].version
            || (state.offers[cartKey(item)]?.unitsPerPack ?? 1) !== fresh[cartKey(item)].unitsPerPack)) {
            throw new Error('PRICE_CHANGED');
          }

          const quote = await request<{ items: (CartItem & { unitAmount: number; productVersion: number })[] }>(
            '/api/checkout/quote', { cartFormat: 'packs-v2', items: state.items },
          );

          const changed = quote.items.length !== state.items.length || quote.items.some(item =>
            state.items.find(value => cartKey(value) === cartKey(item))?.quantity !== item.quantity
            || item.unitAmount !== fresh[cartKey(item)]?.price.unitAmount
            || item.productVersion !== fresh[cartKey(item)]?.version);

          if (changed) throw new Error('PRICE_CHANGED');

          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const guestToken = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
          attempt = {
            cartFormat: 'packs-v2', shippingAddress: { ...address! },
            items: quote.items.map(({ sku, offerId, quantity, productVersion }) => ({
              sku, offerId: offerId ?? 'standard', quantity, productVersion,
            })),
            operationId: crypto.randomUUID(), guestToken,
          };
          session().setItem(pendingKey, JSON.stringify(attempt));
          set({ pending: attempt });
        }

        const result = await request<{ id: string }>('/api/checkout/session', pendingRequest(attempt));
        const pending = { ...attempt, orderId: result.id };
        session().setItem(pendingKey, JSON.stringify(pending));
        set({ pending, open: false });
        return result.id;
      } catch (failure) {
        const code = failure instanceof Error ? failure.message : '';

        if (code === 'CHECKOUT_RELOAD_REQUIRED') {
          try { session().removeItem(pendingKey); }
          catch { set({ error: copy.checkoutError }); return null; }

          set({ pending: null, error: copy.checkoutReloadRequired });
          return null;
        }

        const changed = ['PRICE_CHANGED', 'OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE'].includes(code);
        const unavailable = ['CHECKOUT_UNAVAILABLE', 'STRIPE_NOT_CONFIGURED'].includes(code);
        const message = unavailable ? copy.checkoutUnavailable : copy.checkoutError;
        const addressError = ['INVALID_SHIPPING_ADDRESS', 'SHIPPING_ADDRESS_UNSUPPORTED', 'INVALID_INPUT'].includes(code);
        const failureMessage = addressError ? copy.shippingAddressError : message;
        set({ error: changed ? copy.changedError : failureMessage });
        return null;
      } finally {
        set({ busy: false });
      }
    },
  }));
};
