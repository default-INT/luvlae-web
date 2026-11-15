import Link from 'next/link';

import { Reveal } from '@/shared/ui/Reveal';

import styles from './styles.module.scss';

interface Props {
  copy: {
    ratingLabel: string;
    starsLabel: string;
    ratingNote: string;
    link: string;
  };
  href: string;
}

export const ProductRating = (props: Props) => {
  const { copy, href } = props;

  return (
    <Reveal className={styles.rating}>
      <p className={styles.ratingLabel}>{copy.ratingLabel}</p>
      <p className={styles.score}><strong>4.8</strong><span>/ 5.0</span></p>
      <span className={styles.stars} role='img' aria-label={copy.starsLabel}>
        <span aria-hidden='true'>★★★★★</span>
        <span className={styles.starsFill} aria-hidden='true'>★★★★★</span>
      </span>
      <p className={styles.ratingNote}>{copy.ratingNote}</p>
      <Link className={styles.link} href={href}>
        {copy.link}<span aria-hidden='true'>↗</span>
      </Link>
    </Reveal>
  );
};
