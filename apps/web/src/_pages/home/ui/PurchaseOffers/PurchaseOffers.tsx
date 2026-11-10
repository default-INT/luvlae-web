import Link from 'next/link';

import { money } from '@/shared/lib/money';

import { OfferListAnalytics } from './ui/OfferListAnalytics';
import styles from './styles.module.scss';

import type { PurchaseOffer } from '@/entities/product';

type HighlightBadge = 'bestValue' | 'recommended';

export interface PurchaseOffersCopy {
  eyebrow: string;
  title: string;
  description: string;
  packWord: string;
  boxSingular: string;
  boxPlural: string;
  patches: string;
  totalLabel: string;
  supportingLine: string;
  viewProduct: string;
  soldOut: string;
  badgeLabels: Record<HighlightBadge, string>;
  shipping: string;
  shippingLink: string;
  guarantee: string;
  guaranteeLink: string;
}

export interface PurchaseOffersProps {
  offers: PurchaseOffer[];
  highlightOfferId: string | null;
  highlightBadge: HighlightBadge;
  copy: PurchaseOffersCopy;
}

export const PurchaseOffers = (props: PurchaseOffersProps) => {
  const { offers, highlightOfferId, highlightBadge, copy } = props;

  if (!offers.length) return null;

  return (
    <section className={styles.section} aria-labelledby='purchase-offers-heading'>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>{copy.eyebrow}</p>
          <h2 id='purchase-offers-heading'>{copy.title}</h2>
          <p className={styles.description}>{copy.description}</p>
        </header>
        <OfferListAnalytics offers={offers.slice(0, 3)} className={styles.grid}>
          {offers.slice(0, 3).map(offer => {
            const highlighted = offer.offerId === highlightOfferId;
            const label = `${offer.unitsPerPack}-${copy.packWord}`;
            const boxLabel = offer.unitsPerPack === 1 ? copy.boxSingular : copy.boxPlural;
            const href = `/products/berberine-patches?offer=${encodeURIComponent(offer.offerId)}`;

            return (
              <article className={`${styles.card} ${highlighted ? styles.highlighted : ''}`} key={offer.offerId}
                data-offer-id={offer.offerId}>
                {highlighted ? <span className={styles.badge}>{copy.badgeLabels[highlightBadge]}</span> : null}
                <h3>{label}</h3>
                <p className={styles.count}>
                  {offer.unitsPerPack} {boxLabel}<span aria-hidden='true'> · </span>
                  {offer.patchesPerPack} {copy.patches}
                </p>
                <p className={styles.priceLabel}>{copy.totalLabel}</p>
                <p className={styles.price}>{money(offer.price.unitAmount)}</p>
                <p className={styles.supportingLine}>{copy.supportingLine}</p>
                {offer.availableQuantity === 0 ? <p className={styles.soldOut}>{copy.soldOut}</p> : null}
                <Link className={styles.link} href={href} aria-label={`${copy.viewProduct}: ${label}`}
                  data-purchase-offer-link={offer.offerId}>
                  {copy.viewProduct}
                </Link>
              </article>
            );
          })}
        </OfferListAnalytics>
        <div className={styles.policies}>
          <p>{copy.shipping} <Link href='/shipping'>{copy.shippingLink}</Link></p>
          <p>{copy.guarantee} <Link href='/returns'>{copy.guaranteeLink}</Link></p>
        </div>
      </div>
    </section>
  );
};
