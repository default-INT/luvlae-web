'use client';

import { createContext, useEffect, useState } from 'react';

import type { ReactNode } from 'react';
import type { Dictionary } from '@/shared/config/i18n';

type Review = Dictionary['home']['reviews']['items'][keyof Dictionary['home']['reviews']['items']];
type ReviewPair = readonly [Review, Review];

export const CustomerStoriesContext = createContext<ReviewPair | null>(null);

interface Props {
  reviews: readonly [Review, Review, ...Review[]];
  children: ReactNode;
}

export const CustomerStories = (props: Props) => {
  const { reviews, children } = props;
  const [pair, setPair] = useState<ReviewPair>([reviews[0], reviews[1]]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = Math.floor(Math.random() * reviews.length);
      const next = Math.floor(Math.random() * (reviews.length - 1));
      const second = next < first ? next : next + 1;

      setPair([reviews[first], reviews[second]]);
    });

    return () => cancelAnimationFrame(frame);
  }, [reviews]);

  return <CustomerStoriesContext.Provider value={pair}>{children}</CustomerStoriesContext.Provider>;
};
