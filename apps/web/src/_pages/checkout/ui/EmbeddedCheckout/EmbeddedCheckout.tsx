'use client';

import { loadStripe } from '@stripe/stripe-js';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import styles from './styles.module.scss';

import type { StripeEmbeddedCheckout } from '@stripe/stripe-js';
import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  id: string; publishableKey: string; clientSecret: string; expiresAt: string; copy: Dictionary['commerce'];
}

export const EmbeddedCheckout = (props: Props) => {
  const { id, publishableKey, clientSecret, expiresAt, copy } = props;
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    let checkout: StripeEmbeddedCheckout | undefined;

    const mount = async () => {
      const stripe = await loadStripe(publishableKey);

      if (!active) return;

      if (!stripe) throw new Error('Stripe unavailable');

      const embedded = await stripe.createEmbeddedCheckoutPage({
        clientSecret,
        onComplete: () => { if (active) router.replace(`/orders/${id}`); },
      });

      checkout = embedded;

      if (!active) { embedded.destroy(); return; }

      if (!container.current) { embedded.destroy(); return; }

      embedded.mount(container.current);
      setStatus('ready');
    };

    void mount().catch(() => { if (active) setStatus('error'); });
    return () => { active = false; checkout?.destroy(); };
  }, [id, publishableKey, clientSecret, retry, router]);

  useEffect(() => {
    // Passing this deadline only prompts a server refresh; provider state decides expiry and stock release.
    const delay = Math.max(1000, new Date(expiresAt).getTime() - Date.now() + 1000);
    const timer = window.setTimeout(() => router.refresh(), delay);
    return () => window.clearTimeout(timer);
  }, [expiresAt, router]);

  return (
    <div className={styles.form} aria-busy={status === 'loading'}>
      {status === 'loading' && <p role='status'>{copy.loadingPayment}</p>}
      {status === 'error' && <div role='alert' className={styles.error}>
        <p>{copy.paymentLoadError}</p>
        <button onClick={() => { setStatus('loading'); setRetry(value => value + 1); }}>{copy.tryAgain}</button>
      </div>}
      <div ref={container} className={styles.container}/>
    </div>
  );
};
