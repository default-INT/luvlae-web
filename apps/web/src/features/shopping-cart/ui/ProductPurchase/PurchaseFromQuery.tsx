'use client';

import { useSearchParams } from 'next/navigation';

import { PurchaseForm } from './PurchaseForm';

import type { PurchaseProps } from './PurchaseForm';

export const PurchaseFromQuery = (props: PurchaseProps) => {
  const search = useSearchParams();
  let requested = 'best-value';

  if (search) requested = search.getAll('offer').length > 1 ? '' : search.get('offer') ?? 'best-value';

  return <PurchaseForm {...props} requested={requested}/>;
};
