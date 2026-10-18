'use client';

import { useCart } from '../../model/useCart';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  copy: Dictionary['commerce']
}

export const CartButton = (props: Props) => {
  const { copy } = props;
  const { items, setOpen } = useCart();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <button className={styles.button} onClick={() => setOpen(true)} aria-haspopup='dialog'>
      <svg width='21' height='21' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.6' aria-hidden='true'>
        <path d='M3 3h2l2.5 12h12l2-8H6M9 20h.01M18 20h.01' strokeLinecap='round' strokeLinejoin='round'/>
      </svg>
      <span>{copy.cart}</span><span className={styles.count} aria-live='polite'>{count}</span>
    </button>
  );
};
