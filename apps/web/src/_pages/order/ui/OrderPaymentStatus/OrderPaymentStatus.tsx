'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props { id: string; paymentStatus: string; copy: Dictionary['commerce'] }

export const OrderPaymentStatus = (props: Props) => {
  const { id, paymentStatus, copy } = props;
  const router = useRouter();
  const [polls, setPolls] = useState(0);
  const waiting = ['pending', 'processing'].includes(paymentStatus);

  useEffect(() => {
    if (!waiting || polls >= 12) return;

    const timer = window.setTimeout(() => { setPolls(value => value + 1); router.refresh(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [waiting, polls, router]);

  if (!waiting) return null;

  return (
    <div className={styles.status}>
      <p role='status'>{polls < 12 ? copy.paymentChecking : copy.paymentStillPending}</p>
      <button onClick={() => router.refresh()}>{copy.checkPaymentStatus}</button>
      {paymentStatus === 'pending' && <Link href={`/orders/${id}/checkout`}>{copy.resumeCheckout}</Link>}
    </div>
  );
};
