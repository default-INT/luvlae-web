import Link from 'next/link';

import { interpolate } from '@/shared/lib/i18n';
import { Reveal } from '@/shared/ui/Reveal';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props {
  copy: Dictionary['home']['feedback'];
  href?: string;
  variant?: 'home' | 'product' | 'inline';
}

export const ProductRating = (props: Props) => {
  const { copy, href, variant = 'home' } = props;

  if (variant === 'inline') {
    return (
      <p className={styles.inline}>
        <span aria-hidden='true' className={styles.stars}>★★★★★</span>
        <strong>{copy.ratingValue}/5</strong>
        <span>{copy.reviewCountLabel}</span>
      </p>
    );
  }

  return (
    <Reveal className={`${styles.rating} ${variant === 'product' ? styles.gold : ''}`}>
      <p className={styles.ratingLabel}>{copy.ratingLabel}</p>
      <p className={styles.score}><strong>{copy.ratingValue}</strong><span>/ 5.0</span></p>
      <span
        className={styles.stars}
        role='img'
        aria-label={interpolate(copy.starsLabel, { rating: copy.ratingValue })}
      >
        ★★★★★
      </span>
      <p className={styles.reviewCount}>{copy.reviewCountLabel}</p>
      <p className={styles.ratingNote}>{copy.ratingNote}</p>
      {href && <Link className={styles.link} href={href}>
        {copy.link}<span aria-hidden='true'>↗</span>
      </Link>}
    </Reveal>
  );
};
