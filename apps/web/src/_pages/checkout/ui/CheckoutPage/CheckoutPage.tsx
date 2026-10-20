import Link from 'next/link';

import { product } from '@/entities/product';
import { OrderCartSync } from '@/features/shopping-cart';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { SiteFooter } from '@/widgets/SiteFooter';
import { SiteHeader } from '@/widgets/SiteHeader';

import { EmbeddedCheckout } from '../EmbeddedCheckout';
import { CheckoutStatus } from '../CheckoutStatus';

import styles from './styles.module.scss';

import type { GuestCheckout } from '@/entities/order';

interface Props { id: string; checkout?: GuestCheckout }

export const CheckoutPage = async (props: Props) => {
  const { id, checkout } = props;
  const dictionary = await getDictionary(defaultLocale);
  const copy = dictionary.commerce;
  const showForm = checkout?.status === 'open' && !!checkout.clientSecret;

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <section className={styles.heading}>
          <p>{copy.checkoutEyebrow}</p><h1>{copy.checkoutTitle}</h1>
          <p>{copy.checkoutDescription}</p>
          <Link href={product.path}>{copy.backToCart}</Link>
        </section>
        <section className={styles.payment} aria-label={copy.paymentForm}>
          {!checkout && <p role='alert'>{copy.checkoutUnavailable}</p>}
          {showForm && <EmbeddedCheckout id={id} publishableKey={checkout.publishableKey}
            clientSecret={checkout.clientSecret!} expiresAt={checkout.expiresAt} copy={copy}/>}
          {checkout && !showForm && <CheckoutStatus checkout={checkout} copy={copy}/>}
        </section>
      </main>
      {checkout && ['expired', 'failed'].includes(checkout.paymentStatus)
        && <OrderCartSync id={id} paymentStatus={checkout.paymentStatus} items={[]}/>}
      <SiteFooter dictionary={dictionary}/>
    </>
  );
};
