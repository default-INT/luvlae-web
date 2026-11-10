'use client';

import { useEffect, useRef } from 'react';

import { getHomeOfferListAnalytics } from '@/entities/product';
import { isAnalyticsEnabled, trackItemListEvent } from '@/shared/lib/analytics';

import { observeOfferImpressions } from './utils/observeOfferImpressions';

import type { MouseEvent, ReactNode } from 'react';
import type { PurchaseOffer } from '@/entities/product';

interface Props { offers: PurchaseOffer[]; className: string; children: ReactNode }

export const OfferListAnalytics = (props: Props) => {
  const { offers, className, children } = props;
  const element = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    if (!isAnalyticsEnabled() || !element.current || typeof IntersectionObserver === 'undefined') return;

    return observeOfferImpressions(element.current, getHomeOfferListAnalytics(offers), seen.current);
  }, [offers]);

  const selectOffer = (event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest('[data-purchase-offer-link]');

    if (!link || !element.current?.contains(link)) return;

    const offerId = link.getAttribute('data-purchase-offer-link');
    const parameters = getHomeOfferListAnalytics(offers);
    const items = parameters.items.filter(item => item.item_variant === offerId);

    if (items.length) trackItemListEvent('select_item', { ...parameters, items });
  };

  return <div ref={element} className={className} onClick={selectOffer}>{children}</div>;
};
