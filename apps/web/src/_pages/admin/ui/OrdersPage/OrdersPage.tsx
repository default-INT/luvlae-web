import Link from 'next/link';

import { money } from '@/shared/lib/money';

import { dateTime, fulfillmentStatuses, orderStatuses, paymentStatuses } from '../../model/types';
import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, AdminOrder, Filters, PageResult } from '../../model/types';

interface Props { data: PageResult<AdminOrder>; filters: Filters; copy: AdminCopy }
export const OrdersPage = (props: Props) => {
  const { data, filters, copy } = props;

  const groups = [
    { name: 'orderStatus', label: copy.orderStatus, values: orderStatuses },
    { name: 'paymentStatus', label: copy.paymentStatus, values: paymentStatuses },
    { name: 'fulfillmentStatus', label: copy.fulfillmentStatus, values: fulfillmentStatuses },
  ];

  const labels = copy.statuses as Record<string, string>;
  const next = new URLSearchParams({ ...filters, ...(data.nextCursor ? { cursor: data.nextCursor } : {}) });
  const first = new URLSearchParams(filters);
  first.delete('cursor');
  return (
    <>
      <div className={styles.pageHeader}><span className={styles.eyebrow}>{copy.label}</span>
        <h1>{copy.orders}</h1><p>{copy.ordersDescription}</p></div>
      <form className={`${styles.card} ${styles.filters}`} action='/admin/orders'>
        <label className={styles.field}>{copy.search}<input name='q' maxLength={100} defaultValue={filters.q ?? ''}/></label>
        {groups.map(group => <label className={styles.field} key={group.name}>{group.label}
          <select name={group.name} defaultValue={filters[group.name] ?? ''}><option value=''>{copy.all}</option>
            {group.values.map(status => <option key={status} value={status}>{labels[status]}</option>)}
          </select>
        </label>)}
        <label className={styles.field}>{copy.from}<input name='from' type='date' defaultValue={filters.from ?? ''}/></label>
        <label className={styles.field}>{copy.to}<input name='to' type='date' defaultValue={filters.to ?? ''}/></label>
        <div className={styles.actions}><button className={styles.button}>{copy.apply}</button>
          <Link className={styles.secondary} href='/admin/orders'>{copy.reset}</Link></div>
      </form>
      <div className={`${styles.card} ${styles.tableWrap}`}>
        <table className={styles.table}>
          <thead><tr><th>{copy.orderNumber}</th><th>{copy.created}</th><th>{copy.orderStatus}</th>
            <th>{copy.paymentStatus}</th><th>{copy.fulfillmentStatus}</th><th>{copy.total}</th></tr></thead>
          <tbody>{data.items.map(order => <tr key={order.id}>
            <td><Link href={`/admin/orders/${order.id}`}>{order.orderNumber}</Link></td>
            <td>{dateTime(order.createdAt)}</td><td><StatusTag status={order.orderStatus} copy={copy}/></td>
            <td><StatusTag status={order.paymentStatus} copy={copy}/></td>
            <td><StatusTag status={order.fulfillmentStatus} copy={copy}/></td>
            <td>{order.pricing.total === null ? '—' : money(order.pricing.total)}</td>
          </tr>)}</tbody>
        </table>
        {!data.items.length && <p className={styles.empty}>{copy.noOrders}</p>}
      </div>
      <div className={styles.pagination}>
        {filters.cursor && <Link className={styles.secondary} href={`/admin/orders?${first}`}>{copy.first}</Link>}
        {data.nextCursor && <Link className={styles.button} href={`/admin/orders?${next}`}>{copy.next}</Link>}
      </div>
    </>
  );
};
