'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { product } from '@/entities/product';

import styles from './styles.module.scss';

import type { GuestCheckout } from '@/entities/order';
import type { Dictionary } from '@/shared/config/i18n';

interface Props { checkout: GuestCheckout; copy: Dictionary['commerce'] }

export const CheckoutStatus = (props: Props) => {
  const { checkout, copy } = props;
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const settled = ['paid', 'expired', 'failed'].includes(checkout.paymentStatus);

  useEffect(() => {
    if (checkout.status === 'complete' || checkout.paymentStatus === 'paid') {
      router.replace(`/orders/${checkout.id}`);
      return;
    }

    if (settled || polls >= 12) return;

    const timer = window.setTimeout(() => { setPolls(value => value + 1); router.refresh(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [checkout.id, checkout.status, checkout.paymentStatus, settled, polls, router]);

  const pendingDescription = checkout.status === 'expired' ? copy.checkoutExpiryPending : copy.paymentPendingDescription;

  return (
    <div className={styles.status}>
      <h2>{checkout.status === 'expired' ? copy.checkoutExpiredTitle : copy.paymentPendingTitle}</h2>
      <p role='status'>{settled ? copy.checkoutExpiredDescription : pendingDescription}</p>
      {!settled && <button onClick={() => router.refresh()}>{copy.checkPaymentStatus}</button>}
      <Link href={product.path}>{copy.backToCart}</Link>
    </div>
  );
};
