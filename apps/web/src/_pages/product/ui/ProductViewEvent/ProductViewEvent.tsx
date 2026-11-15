'use client';

import { useSearchParams } from 'next/navigation';

import { getProductAnalytics } from '@/entities/product';
import { EcommerceEvent } from '@/shared/ui/EcommerceEvent';

import type { ProductOffer } from '@/entities/product';

interface Props { offer: ProductOffer }

// Reads ?offer= on the client so the cached PDP HTML stays identical for every query string.
export const ProductViewEvent = (props: Props) => {
  const { offer } = props;
  const search = useSearchParams();
  const offers = search?.getAll('offer') ?? [];
  const offerId = offers.length === 1 ? offers[0] : undefined;

  return <EcommerceEvent name='view_item' parameters={getProductAnalytics(offer, 1, offerId)}/>;
};
