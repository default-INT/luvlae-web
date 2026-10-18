import Link from 'next/link';

import { money } from '@/shared/lib/money';

import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, AdminProduct, PageResult } from '../../model/types';

interface Props { data: PageResult<AdminProduct>; copy: AdminCopy; cursor?: string }
export const ProductsPage = (props: Props) => {
  const { data, copy, cursor } = props;
  return (
    <>
      <div className={styles.pageHeader}><span className={styles.eyebrow}>{copy.label}</span>
        <h1>{copy.products}</h1><p>{copy.productsDescription}</p></div>
      <div className={`${styles.card} ${styles.tableWrap}`}>
        <table className={styles.table}>
          <thead><tr><th>{copy.name}</th><th>{copy.price}</th><th>{copy.stock}</th><th>{copy.reserved}</th>
            <th>{copy.available}</th><th>{copy.sales}</th></tr></thead>
          <tbody>{data.items.map(product => <tr key={product.sku}>
            <td><Link href={`/admin/products/${product.sku}`}>{product.name}</Link><small>{product.sku}</small></td>
            <td>{money(product.price.unitAmount)}</td><td>{product.inventory.stockQuantity}</td>
            <td>{product.inventory.reservedQuantity}</td><td>{product.availableQuantity}</td>
            <td><StatusTag status={product.salesEnabled ? 'enabled' : 'disabled'} copy={copy}/></td>
          </tr>)}</tbody>
        </table>
        {!data.items.length && <p className={styles.empty}>{copy.noProducts}</p>}
      </div>
      <div className={styles.pagination}>
        {cursor && <Link className={styles.secondary} href='/admin/products'>{copy.first}</Link>}
        {data.nextCursor &&
        <Link className={styles.button} href={`/admin/products?cursor=${data.nextCursor}`}>{copy.next}</Link>}
      </div>
    </>
  );
};
