'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { money } from '@/shared/lib/money';

import { useAdminResource } from '../../model/useAdminResource';
import { DataStatus } from '../DataStatus';
import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, AdminProduct, PageResult } from '../../model/types';

interface Props { copy: AdminCopy }

export const ProductsPage = (props: Props) => {
  const { copy } = props;
  const search = useSearchParams();
  const cursor = search.get('cursor') ?? '';
  const query = new URLSearchParams(cursor ? { cursor } : {}).toString();
  const resource = useAdminResource<PageResult<AdminProduct>>(`/products?${query}`, copy);

  const navigate = (nextCursor?: string) => {
    const next = nextCursor ? `/admin/products?${new URLSearchParams({ cursor: nextCursor })}` : '/admin/products';
    window.history.pushState(null, '', next);
  };

  return (
    <>
      <div className={styles.pageHeader}><span className={styles.eyebrow}>{copy.label}</span>
        <h1>{copy.products}</h1><p>{copy.productsDescription}</p>
        <button className={styles.secondary} onClick={() => { void resource.reload(); }} disabled={resource.loading}>
          {copy.refresh}
        </button>
      </div>
      <DataStatus loading={resource.loading} error={resource.error} copy={copy} onRetry={() => { void resource.reload(); }}/>
      <div className={`${styles.card} ${styles.tableWrap}`} aria-busy={resource.loading}>
        <table className={styles.table}>
          <thead><tr><th>{copy.name}</th><th>{copy.price}</th><th>{copy.stock}</th><th>{copy.reserved}</th>
            <th>{copy.available}</th><th>{copy.sales}</th></tr></thead>
          <tbody>{resource.data?.items.map(product => <tr key={product.sku}>
            <td><Link href={`/admin/products/${product.sku}`}>{product.name}</Link><small>{product.sku}</small></td>
            <td>{money(product.price.unitAmount)}</td><td>{product.inventory.stockQuantity}</td>
            <td>{product.inventory.reservedQuantity}</td><td>{product.availableQuantity}</td>
            <td><StatusTag status={product.salesEnabled ? 'enabled' : 'disabled'} copy={copy}/></td>
          </tr>)}</tbody>
        </table>
        {resource.data && !resource.loading && !resource.data.items.length && <p className={styles.empty}>{copy.noProducts}</p>}
      </div>
      <div className={styles.pagination}>
        {cursor && <button className={styles.secondary} onClick={() => navigate()}>{copy.first}</button>}
        {resource.data?.nextCursor && <button className={styles.button}
          onClick={() => navigate(resource.data!.nextCursor!)}>{copy.next}</button>}
      </div>
    </>
  );
};
