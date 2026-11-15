'use client';

import { Suspense } from 'react';

import { PurchaseForm } from './PurchaseForm';
import { PurchaseFromQuery } from './PurchaseFromQuery';

import type { PurchaseProps } from './PurchaseForm';

// The PDP HTML is edge-cached for every query string, so ?offer= is applied on the client.
export const ProductPurchase = (props: PurchaseProps) => (
  <Suspense fallback={<PurchaseForm {...props} requested='standard'/>}>
    <PurchaseFromQuery {...props}/>
  </Suspense>
);
