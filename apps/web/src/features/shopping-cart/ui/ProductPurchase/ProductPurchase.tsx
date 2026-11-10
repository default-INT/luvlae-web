'use client';

import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

import { product } from '@/entities/product';
import { money } from '@/shared/lib/money';

import { selectPurchaseOffer, toCartOffer } from '../../model/cart';
import { useCart } from '../../model/useCart';
import { PackSelector } from '../PackSelector';

import styles from './styles.module.scss';

import type { ProductOffer } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

interface Props { offer: ProductOffer | null; copy: Dictionary['commerce']; initialOfferId?: string }

export const ProductPurchase = (props: Props) => {
  const { offer, copy, initialOfferId } = props;
  const { busy, pending, add } = useCart();
  const [addError, setAddError] = useState(false);
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  let requested = initialOfferId ?? 'standard';

  if (search) requested = search.getAll('offer').length > 1 ? '' : search.get('offer') ?? 'standard';

  const offers = offer?.purchaseOffers ?? [];
  const { selected, invalid } = selectPurchaseOffer(offers, requested);
  const available = !!offer?.salesEnabled && !!selected && selected.availableQuantity > 0;

  return (
    <div className={styles.purchase}>
      <PackSelector offers={offers} selected={selected?.offerId ?? 'standard'} disabled={busy || !!pending} copy={copy}
        onChange={id => {
          const query = new URLSearchParams(search?.toString());
          query.set('offer', id);
          setAddError(false);
          router.push(`${pathname}?${query}`, { scroll: false });
        }}/>
      {offer && invalid && <p role='alert'>{copy.invalidPack}</p>}
      <p className={styles.price} aria-live='polite'>
        {copy.packTotal}: {selected ? money(selected.price.unitAmount) : copy.priceUnavailable}
      </p>
      {!offer && <p role='alert'>{copy.offerError} <a href={product.path}>{copy.retry}</a></p>}
      {selected && <p className={styles.availability}>{available ? copy.inStock : copy.soldOut}</p>}
      <div className={styles.actions}>
        <button className={styles.add} disabled={busy || !!pending || !available}
          onClick={() => { if (offer && selected) setAddError(!add(toCartOffer(offer, selected), 1)); }}>{copy.addToCart}</button>
      </div>
      {addError && <p role='alert'>{copy.cartLimit}</p>}
      <p>{copy.shippingLine} <Link href='/shipping'>{copy.shippingLink}</Link></p>
      <p>{copy.guaranteeLine} <Link href='/returns'>{copy.guaranteeLink}</Link></p>
      <p>{copy.guaranteeDetail}</p>
    </div>
  );
};
