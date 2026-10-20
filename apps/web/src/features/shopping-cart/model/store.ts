import { createStore } from 'zustand/vanilla';

import { commerceRequest } from '../api/commerce';

import { pendingKey, storageKey } from './cart';

import type { CartItem, Offer, PendingCheckout } from './cart';
import type { Dictionary } from '@/shared/config/i18n';

interface CartState {
  items: CartItem[]; offers: Record<string, Offer>; offerErrors: Record<string, string>;
  settledOrders: string[]; ready: boolean; open: boolean; busy: boolean; pending: PendingCheckout | null; error: string;
  restore: (items: CartItem[], offers: Record<string, Offer>, pending: PendingCheckout | null, settledOrders?: string[]) => void;
  setOpen: (open: boolean) => void;
  add: (offer: Offer, quantity: number) => void;
  update: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  checkout: (copy: Dictionary['commerce']) => Promise<string | null>;
  confirmPaidOrder: (id: string, purchased: CartItem[]) => void;
  releaseExpiredCheckout: (id: string) => void;
}
interface Dependencies {
  request?: typeof commerceRequest;
  session?: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  persistent?: () => Pick<Storage, 'setItem'>;
}

// Never contains server request data. Each SSR consumer receives a fresh empty store.
export const createCartStore = (dependencies: Dependencies = {}) => {
  const request = dependencies.request ?? commerceRequest;
  const session = dependencies.session ?? (() => sessionStorage);
  const persistent = dependencies.persistent ?? (() => localStorage);

  return createStore<CartState>()((set, get) => ({
    items: [], offers: {}, offerErrors: {}, settledOrders: [], ready: false, open: false, busy: false, pending: null, error: '',
    restore: (items, offers, pending, settledOrders = []) => set({ items, offers, pending, settledOrders, ready: true }),
    setOpen: open => set({ open }),
    add: (offer, quantity) => {
      const state = get();

      if (state.busy || state.pending || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;

      const current = state.offers[offer.sku];
      const latest = current && current.version > offer.version ? current : offer;
      const max = Math.min(99, latest.availableQuantity);

      if (!latest.salesEnabled || max < 1) return;

      const existing = state.items.find(item => item.sku === offer.sku);

      if (!existing && state.items.length >= 20) return;

      const next = Math.min(max, quantity + (existing?.quantity ?? 0));

      const items = existing ? state.items.map(item => item.sku === offer.sku ? { ...item, quantity: next } : item)
        : [...state.items, { sku: offer.sku, quantity: next }];

      set({ items, offers: { ...state.offers, [offer.sku]: latest }, open: true, error: '' });
    },
    update: (sku, quantity) => {
      if (get().busy || get().pending || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) return;

      set({ items: get().items.map(item => item.sku === sku ? { sku, quantity } : item), error: '' });
    },
    remove: sku => {
      if (get().busy || get().pending) return;

      set({ items: get().items.filter(item => item.sku !== sku), error: '' });
    },
    confirmPaidOrder: (id, purchased) => {
      const state = get();

      if (!state.ready || state.pending?.orderId !== id) return;

      const alreadySettled = state.settledOrders.includes(id);

      const items = alreadySettled ? state.items : state.items.flatMap(item => {
        const count = purchased.find(value => value.sku === item.sku)?.quantity ?? 0;
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
    checkout: async copy => {
      const state = get();

      if (state.busy || !state.items.length) return null;

      set({ busy: true, error: '' });

      try {
        let attempt = state.pending;

        if (!attempt) {
          // Price and availability are verified only after the customer clicks Checkout.
          const fresh: Record<string, Offer> = {};
          const errors: Record<string, string> = {};
          await Promise.all(state.items.map(async item => {
            try { fresh[item.sku] = await request<Offer>(`/api/products/${item.sku}`); }
            catch { errors[item.sku] = copy.offerError; }
          }));
          set({ offers: { ...state.offers, ...fresh }, offerErrors: errors });

          if (Object.keys(errors).length) throw new Error('PRODUCT_UNAVAILABLE');

          if (state.items.some(item => item.quantity > fresh[item.sku].availableQuantity)) throw new Error('OUT_OF_STOCK');

          if (state.items.some(item => state.offers[item.sku]?.price.unitAmount !== fresh[item.sku].price.unitAmount
            || state.offers[item.sku]?.version !== fresh[item.sku].version)) throw new Error('PRICE_CHANGED');

          const quote = await request<{ items: (CartItem & { unitAmount: number; productVersion: number })[] }>(
            '/api/checkout/quote', { items: state.items },
          );

          const changed = quote.items.some(item => item.unitAmount !== fresh[item.sku].price.unitAmount
            || item.productVersion !== fresh[item.sku].version);

          if (changed) {
            for (const item of quote.items) { fresh[item.sku] = {
              ...fresh[item.sku], price: { currency: 'USD', unitAmount: item.unitAmount }, version: item.productVersion,
            }; }

            set({ offers: { ...get().offers, ...fresh } });
            throw new Error('PRICE_CHANGED');
          }

          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const guestToken = btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
          attempt = {
            items: quote.items.map(({ sku, quantity, productVersion }) => ({ sku, quantity, productVersion })),
            operationId: crypto.randomUUID(), guestToken,
          };
          // Retain the exact request until its outcome is known, including across reloads.
          session().setItem(pendingKey, JSON.stringify(attempt));
          set({ pending: attempt });
        }

        const { operationId, guestToken, items } = attempt;
        const result = await request<{ id: string }>('/api/checkout/session', { operationId, guestToken, items });
        const pending = { ...attempt, orderId: result.id };
        session().setItem(pendingKey, JSON.stringify(pending));
        set({ pending, open: false });
        return result.id;
      } catch (failure) {
        const code = failure instanceof Error ? failure.message : '';
        const changed = ['PRICE_CHANGED', 'OUT_OF_STOCK', 'PRODUCT_UNAVAILABLE'].includes(code);

        if (changed || ['INVALID_INPUT'].includes(code)) {
          session().removeItem(pendingKey);
          set({ pending: null });
        }

        const unavailable = ['CHECKOUT_UNAVAILABLE', 'STRIPE_NOT_CONFIGURED'].includes(code);
        const message = unavailable ? copy.checkoutUnavailable : copy.checkoutError;
        set({ error: changed ? copy.changedError : message });
        return null;
      } finally {
        set({ busy: false });
      }
    },
  }));
};
