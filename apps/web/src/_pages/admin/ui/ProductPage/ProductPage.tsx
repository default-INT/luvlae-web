'use client';

import { useAdminResource } from '../../model/useAdminResource';
import { DataStatus } from '../DataStatus';
import { ProductEditor } from '../ProductEditor';

import type { AdminCopy, AdminProduct } from '../../model/types';

interface Props { sku: string; copy: AdminCopy }
export const ProductPage = (props: Props) => {
  const { sku, copy } = props;
  const resource = useAdminResource<AdminProduct>(`/products/${encodeURIComponent(sku)}`, copy);
  return <>
    <DataStatus loading={resource.loading} error={resource.error} copy={copy} onRetry={() => { void resource.reload(); }}/>
    {resource.data && <ProductEditor initialProduct={resource.data} copy={copy} key={sku}/>}
  </>;
};
