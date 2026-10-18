'use client';

import { useState } from 'react';
import { useStore } from 'zustand';

import { createCartStore } from './store';

let browserStore: ReturnType<typeof createCartStore> | undefined;

export const getCartStore = () => {
  if (typeof window === 'undefined') return createCartStore();
  browserStore ??= createCartStore();
  return browserStore;
};

export const useCart = () => {
  const [store] = useState(getCartStore);
  return useStore(store);
};
