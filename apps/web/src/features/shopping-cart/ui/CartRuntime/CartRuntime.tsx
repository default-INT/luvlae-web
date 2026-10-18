'use client';

import { useEffect } from 'react';

import { parseCart, parseOffers, parsePending, pendingKey, storageKey } from '../../model/cart';
import { getCartStore } from '../../model/useCart';
import { CartDrawer } from '../CartDrawer';

import type { Dictionary } from '@/shared/config/i18n';

interface Props { copy: Dictionary['commerce'] }
export const CartRuntime = (props: Props) => {
  const { copy } = props;
  useEffect(() => {
    const store = getCartStore();
    if (!store.getState().ready) {
      let items = store.getState().items;
      let offers = store.getState().offers;
      let pending = null;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('luvlae-cart-v1') ?? '[]');
        items = parseCart(Array.isArray(saved) ? saved : saved?.items);
        offers = parseOffers(saved?.offers, items);
      } catch { /* Keep the cart usable when storage is unavailable. */ }
      try { pending = parsePending(JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null')); }
      catch { /* A new checkout validates storage before sending a request. */ }
      store.getState().restore(items, offers, pending);
    }

    const save = () => {
      const { items, offers } = store.getState();
      try { localStorage.setItem(storageKey, JSON.stringify({ items, offers })); }
      catch { /* Browsers may block storage; in-memory cart editing still works. */ }
    };

    save();

    const unsubscribe = store.subscribe((state, previous) => {
      if (state.items !== previous.items || state.offers !== previous.offers) save();
    });

    const sync = (event: StorageEvent) => {
      const state = store.getState();
      if (event.key !== storageKey || state.busy || state.pending) return;
      try {
        const saved = JSON.parse(event.newValue ?? '{}');
        const items = parseCart(saved?.items);
        state.restore(items, parseOffers(saved?.offers, items), null);
      } catch { /* Ignore malformed data written by another tab. */ }
    };

    window.addEventListener('storage', sync);
    return () => { unsubscribe(); window.removeEventListener('storage', sync); };
  }, []);
  return <CartDrawer copy={copy}/>;
};
