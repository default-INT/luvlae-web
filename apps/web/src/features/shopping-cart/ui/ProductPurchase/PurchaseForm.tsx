'use client';

import { useRouter, usePathname } from 'next/navigation';
import { startTransition, useOptimistic, useState } from 'react';

import { product, resolveOfferRequest } from '@/entities/product';
import { money } from '@/shared/lib/money';

import { selectPurchaseOffer, toCartOffer } from '../../model/cart';
import { useCart } from '../../model/useCart';
import { PackSelector } from '../PackSelector';
import { PurchasePolicyTags } from '../PurchasePolicyTags';

import styles from './styles.module.scss';

import type { ProductOffer } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

export interface PurchaseProps { offer: ProductOffer | null; copy: Dictionary['commerce'] }

export const PurchaseForm = (props: PurchaseProps & { requested: string }) => {
  const { offer, copy, requested } = props;
  const { busy, pending, add } = useCart();
  const [addError, setAddError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const [optimisticRequested, setOptimisticRequested] = useOptimistic(requested);
  const offers = offer?.purchaseOffers ?? [];
  const { selected, invalid } = selectPurchaseOffer(offers, resolveOfferRequest(offer, optimisticRequested));
  const available = !!offer?.salesEnabled && !!selected && selected.availableQuantity > 0;

  return (
    <div className={styles.purchase}>
      <PackSelector
        storefront={offer?.storefront}
        offers={offers}
        selected={selected?.offerId ?? 'standard'}
        disabled={busy || !!pending}
        copy={copy}
        onChange={id => {
          const query = new URLSearchParams(window.location.search);
          query.set('offer', id);
          setAddError(false);
          startTransition(() => {
            setOptimisticRequested(id);
            router.push(`${pathname}?${query}`, { scroll: false });
          });
        }}
      />
      {offer && invalid && <p role='alert'>{copy.invalidPack}</p>}
      <p className={styles.price} aria-live='polite'>
        {copy.packTotal}: {selected ? money(selected.price.unitAmount) : copy.priceUnavailable}
      </p>
      <PurchasePolicyTags copy={copy}/>
      {!offer && <p role='alert'>{copy.offerError} <a href={product.path}>{copy.retry}</a></p>}
      {selected && <p className={styles.availability}>{available ? copy.inStock : copy.soldOut}</p>}
      <div className={styles.actions}>
        <button className={styles.add} disabled={busy || !!pending || !available}
          onClick={() => { if (offer && selected) setAddError(!add(toCartOffer(offer, selected), 1)); }}>{copy.addToCart}</button>
      </div>
      {addError && <p role='alert'>{copy.cartLimit}</p>}
    </div>
  );
};
