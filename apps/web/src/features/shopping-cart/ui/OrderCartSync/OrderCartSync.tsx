'use client';

import { useEffect } from 'react';

import { useCart } from '../../model/useCart';

import type { CartItem } from '../../model/cart';

interface Props { id: string; paymentStatus: string; items: CartItem[] }

export const OrderCartSync = (props: Props) => {
  const { id, paymentStatus, items } = props;
  const { ready, confirmPaidOrder, releaseExpiredCheckout } = useCart();

  useEffect(() => {
    if (!ready) return;

    if (paymentStatus === 'paid') confirmPaidOrder(id, items);

    if (['expired', 'failed'].includes(paymentStatus)) releaseExpiredCheckout(id);
  }, [id, paymentStatus, items, ready, confirmPaidOrder, releaseExpiredCheckout]);

  return null;
};
