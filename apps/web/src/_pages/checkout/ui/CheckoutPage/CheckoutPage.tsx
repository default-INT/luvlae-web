import { randomInt } from 'node:crypto';

import Link from 'next/link';

import { product } from '@/entities/product';
import { getOrderItemsAnalytics } from '@/entities/order';
import { OrderCartSync } from '@/features/shopping-cart';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { EcommerceEvent } from '@/shared/ui/EcommerceEvent';
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
  const { six, seven, nine } = dictionary.home.reviews.items;
  const featuredReviews = [six, seven, nine];
  const review = showForm ? featuredReviews[randomInt(featuredReviews.length)] : null;
  const rating = review ? Number(review.rating) : 0;

  return (
    <>
      <SiteHeader dictionary={dictionary}/>
      <main className={styles.main}>
        <section className={styles.heading}>
          <p>{copy.checkoutEyebrow}</p><h1>{copy.checkoutTitle}</h1>
          <p>{copy.checkoutDescription}</p>
          <Link href={product.bestValuePath}>{copy.backToCart}</Link>
        </section>
        <section className={styles.payment} aria-label={copy.paymentForm}>
          {!checkout && <p role='alert'>{copy.checkoutUnavailable}</p>}
          {showForm && review && (
            <>
              <div className={styles.brand}>
                <h2>{copy.checkoutBrand}</h2>
                <p>{copy.checkoutWearers}</p>
              </div>
              <figure className={styles.story}>
                <figcaption>
                  <span>{copy.checkoutStories}</span>
                  <span
                    className={styles.stars}
                    role='img'
                    aria-label={dictionary.home.reviews.ratingLabel.replace('{{rating}}', review.rating)}
                  >
                    {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
                  </span>
                </figcaption>
                <blockquote>“{review.body}”</blockquote>
              </figure>
              <EmbeddedCheckout
                id={id}
                publishableKey={checkout.publishableKey}
                clientSecret={checkout.clientSecret!}
                expiresAt={checkout.expiresAt}
                copy={copy}
              />
            </>
          )}
          {checkout && !showForm && <CheckoutStatus checkout={checkout} copy={copy}/>}
        </section>
      </main>
      {showForm && checkout.quote && checkout.publishableKey.startsWith('pk_live_')
        && <EcommerceEvent name='begin_checkout' onceKey={id} parameters={getOrderItemsAnalytics(
          checkout.quote.items, checkout.quote.currency, checkout.quote.subtotal,
        )}/>}
      {checkout && ['expired', 'failed'].includes(checkout.paymentStatus)
        && <OrderCartSync id={id} paymentStatus={checkout.paymentStatus} items={[]}/>}
      <SiteFooter dictionary={dictionary}/>
    </>
  );
};
