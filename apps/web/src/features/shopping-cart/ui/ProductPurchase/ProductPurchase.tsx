'use client';

import { useState } from 'react';

import { product } from '@/entities/product';
import { money } from '@/shared/lib/money';
import { QuantityInput } from '@/shared/ui/QuantityInput';

import { useCart } from '../../model/useCart';

import styles from './styles.module.scss';

import type { ProductOffer } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

interface Props { offer: ProductOffer | null; copy: Dictionary['commerce'] }

export const ProductPurchase = (props: Props) => {
  const { offer, copy } = props;
  const { busy, pending, add, items } = useCart();
  const [quantity, setQuantity] = useState(1);
  const inCart = items.find(item => item.sku === product.sku)?.quantity ?? 0;
  const max = Math.max(0, Math.min(99, offer?.availableQuantity ?? 0) - inCart);
  const selected = Math.min(quantity, Math.max(1, max));
  return (
    <div className={styles.purchase}>
      <p className={styles.price} aria-live='polite'>{offer ? money(offer.price.unitAmount) : copy.priceUnavailable}</p>
      {!offer && <p role='alert'>{copy.offerError} <a href={product.path}>{copy.retry}</a></p>}
      {offer && <p className={styles.availability}>{offer.availableQuantity > 0 ? copy.inStock : copy.soldOut}</p>}
      <div className={styles.actions}>
        <QuantityInput label={copy.quantity} value={selected} max={Math.max(1, max)}
          decreaseLabel={copy.decreaseQuantity} increaseLabel={copy.increaseQuantity}
          disabled={busy || !!pending || max < 1} onChange={setQuantity}/>
        <button className={styles.add} disabled={busy || !!pending || max < 1}
          onClick={() => { if (offer) add(offer, selected); }}>{copy.addToCart}</button>
      </div>
      {offer && offer.availableQuantity > 0 && max === 0 && <p>{copy.cartLimit}</p>}
    </div>
  );
};
