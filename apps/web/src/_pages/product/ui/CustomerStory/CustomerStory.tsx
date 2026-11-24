'use client';

import { useContext, useEffect, useRef, useState } from 'react';

import { interpolate } from '@/shared/lib/i18n';

import { CustomerStoriesContext } from '../CustomerStories';

import styles from './styles.module.scss';

interface Props {
  index: 0 | 1;
  starsLabel: string;
  label?: string;
  matchRatingHeight?: boolean;
}

export const CustomerStory = (props: Props) => {
  const { index, starsLabel, label, matchRatingHeight = false } = props;
  const review = useContext(CustomerStoriesContext)?.[index];
  const quote = review ? `"${review.body}"` : '';
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [excerpt, setExcerpt] = useState({ quote: '', text: '' });

  useEffect(() => {
    const block = quoteRef.current;
    const measure = measureRef.current;

    if (!block || !measure) return;

    const fitQuote = () => {
      const maxHeight = parseFloat(getComputedStyle(block).maxHeight);
      const limit = Number.isFinite(maxHeight) ? maxHeight : block.getBoundingClientRect().height;
      measure.textContent = quote;

      if (measure.getBoundingClientRect().height <= limit + 1) {
        setExcerpt({ quote, text: quote });
        return;
      }

      const words = quote.slice(0, -1).split(' ');
      let fits = 0;
      let overflows = words.length + 1;

      while (overflows - fits > 1) {
        const middle = Math.floor((fits + overflows) / 2);
        measure.textContent = `${words.slice(0, middle).join(' ')}..."`;

        if (measure.getBoundingClientRect().height <= limit + 1) fits = middle;
        else overflows = middle;
      }

      const start = fits ? words.slice(0, fits).join(' ') : '"';
      setExcerpt({ quote, text: `${start}..."` });
    };

    const observer = new ResizeObserver(fitQuote);
    observer.observe(block);

    return () => observer.disconnect();
  }, [quote]);

  if (!review) return null;

  const rating = Number(review.rating);

  return (
    <figure className={`${styles.story} ${matchRatingHeight ? styles.matchRating : styles.compact}`}>
      <figcaption>
        {label && <span className={styles.label}>{label}</span>}
        <strong>{review.displayName}</strong>
        <span className={styles.stars} role='img' aria-label={interpolate(starsLabel, { rating })}>
          {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
        </span>
      </figcaption>
      <blockquote ref={quoteRef}>
        <span className={styles.quoteText}>{excerpt.quote === quote ? excerpt.text : quote}</span>
        <span className={styles.quoteMeasure} ref={measureRef} aria-hidden='true'/>
      </blockquote>
    </figure>
  );
};
