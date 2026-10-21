'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { product } from '@/entities/product';
import { money } from '@/shared/lib/money';
import { Drawer } from '@/shared/ui/Drawer';
import { QuantityInput } from '@/shared/ui/QuantityInput';

import { useCart } from '../../model/useCart';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props { copy: Dictionary['commerce'] }

export const CartDrawer = (props: Props) => {
  const { copy } = props;

  const {
    open, setOpen, items, offers, offerErrors, update, remove, busy, cancelling, pending, error, checkout, cancelCheckout,
  } = useCart();

  const router = useRouter();
  const knownPrices = items.every(item => offers[item.sku]);
  const subtotal = items.reduce((sum, item) => sum + (offers[item.sku]?.price.unitAmount ?? 0) * item.quantity, 0);
  const checkoutLabel = pending ? copy.resumeCheckout : copy.checkout;
  const busyLabel = cancelling ? copy.cancellingCheckout : copy.creatingOrder;

  return (
    <Drawer open={open} onClose={() => setOpen(false)} className={styles.drawer} labelledBy='cart-title'>
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>{copy.yourSelection}</p><h2 id='cart-title'>{copy.cart}</h2></div>
        <button className={styles.close} onClick={() => setOpen(false)} aria-label={copy.close}>×</button>
      </div>
      <div className={styles.items}>
        {!items.length && <div className={styles.empty}>
          <span aria-hidden='true'>↗</span><h3>{copy.emptyTitle}</h3><p>{copy.emptyDescription}</p>
          <Link href={product.path} onClick={() => setOpen(false)}>{copy.exploreProduct}</Link>
        </div>}
        {items.map(item => {
          const offer = offers[item.sku];

          return (
            <article className={styles.item} key={item.sku}>
              <Image src='/images/luvlae-berberine-patches-box-and-patch-sheet.webp' alt='' width={96} height={96}/>
              <div className={styles.itemBody}>
                <Link href={product.path} onClick={() => setOpen(false)}>{offer?.name ?? product.name}</Link>
                <p>{offer ? money(offer.price.unitAmount) : copy.priceUnavailable}</p>
                {offerErrors[item.sku] && <p role='alert'>{offerErrors[item.sku]}</p>}
                {offer && item.quantity > offer.availableQuantity && <p role='alert'>{copy.stockError}</p>}
                <div className={styles.controls}>
                  <QuantityInput label={copy.quantity} value={item.quantity} disabled={busy}
                    decreaseLabel={copy.decreaseQuantity} increaseLabel={copy.increaseQuantity}
                    onChange={async quantity => {
                      if (await cancelCheckout(copy)) update(item.sku, quantity);
                    }}/>
                  <button className={styles.remove} disabled={busy} onClick={async () => {
                    if (await cancelCheckout(copy)) remove(item.sku);
                  }}>{copy.remove}</button>
                </div>
                {offer && <strong>{money(offer.price.unitAmount * item.quantity)}</strong>}
              </div>
            </article>
          );
        })}
      </div>
      {!!items.length && <div className={styles.summary}>
        <div className={styles.subtotal}><span>{copy.subtotal}</span><strong>{knownPrices ? money(subtotal) : '—'}</strong></div>
        {pending && <p className={styles.pending}>{copy.pendingCheckout}</p>}
        {error && <p role='alert' className={styles.error}>{error}</p>}
        <button className={styles.checkout} disabled={busy}
          onClick={async () => {
            const id = await checkout(copy);

            if (id) router.push(`/orders/${id}/checkout`);
          }}>{busy ? busyLabel : checkoutLabel}</button>
        {pending && <button className={styles.cancel} disabled={busy}
          onClick={() => void cancelCheckout(copy)}>{cancelling ? copy.cancellingCheckout : copy.cancelCheckout}</button>}
        <button className={styles.continue} onClick={() => setOpen(false)}>{copy.continueShopping}</button>
      </div>}
    </Drawer>
  );
};
