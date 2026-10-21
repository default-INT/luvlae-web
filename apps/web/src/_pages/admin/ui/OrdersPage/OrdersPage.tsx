'use client';

import { useSearchParams } from 'next/navigation';

import { money } from '@/shared/lib/money';

import { orderSelection, ordersUrl, readOrderFilters } from '../../model/navigation';
import { dateTime, fulfillmentStatuses, orderStatuses, paymentStatuses } from '../../model/types';
import { useAdminResource } from '../../model/useAdminResource';
import { DataStatus } from '../DataStatus';
import { OrderDrawer } from '../OrderDrawer';
import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, AdminOrder, PageResult } from '../../model/types';
import type { FormEvent } from 'react';

interface Props { copy: AdminCopy }

export const OrdersPage = (props: Props) => {
  const { copy } = props;
  const search = useSearchParams();
  const filters = readOrderFilters(search);
  const filterQuery = new URLSearchParams(filters).toString();
  const selected = orderSelection(search);
  const resource = useAdminResource<PageResult<AdminOrder>>(`/orders?${filterQuery}`, copy);
  const initialLoading = resource.loading && !resource.data;

  const groups = [
    { name: 'orderStatus', label: copy.orderStatus, values: orderStatuses },
    { name: 'paymentStatus', label: copy.paymentStatus, values: paymentStatuses },
    { name: 'fulfillmentStatus', label: copy.fulfillmentStatus, values: fulfillmentStatuses },
  ];

  const labels = copy.statuses as Record<string, string>;

  const navigate = (next: Record<string, string>, id?: string | null, replace = false) => {
    const url = ordersUrl(next, id);

    if (replace) window.history.replaceState(null, '', url);
    else window.history.pushState(null, '', url);
  };

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const next: Record<string, string> = {};

    for (const key of ['q', 'orderStatus', 'paymentStatus', 'fulfillmentStatus', 'from', 'to']) {
      const value = String(values.get(key) ?? '').trim();

      if (value) next[key] = value;
    }

    navigate(next);
  };

  const first = { ...filters };
  delete first.cursor;
  return (
    <>
      <div className={styles.pageHeader}><span className={styles.eyebrow}>{copy.label}</span>
        <h1>{copy.orders}</h1><p>{copy.ordersDescription}</p>
        <button className={styles.secondary} onClick={() => { void resource.reload(); }} disabled={resource.loading}>
          {copy.refresh}
        </button>
      </div>
      <DataStatus skeleton loading={initialLoading} error={resource.error} copy={copy}
        onRetry={() => { void resource.reload(); }}/>
      {!initialLoading && <>
        <form className={`${styles.card} ${styles.filters}`} onSubmit={apply} key={filterQuery}>
          <label className={styles.field}>{copy.search}<input name='q' maxLength={100} defaultValue={filters.q ?? ''}/></label>
          {groups.map(group => <label className={styles.field} key={group.name}>{group.label}
            <select name={group.name} defaultValue={filters[group.name] ?? ''}><option value=''>{copy.all}</option>
              {group.values.map(status => <option key={status} value={status}>{labels[status]}</option>)}
            </select>
          </label>)}
          <label className={styles.field}>{copy.from}<input name='from' type='date' defaultValue={filters.from ?? ''}/></label>
          <label className={styles.field}>{copy.to}<input name='to' type='date' defaultValue={filters.to ?? ''}/></label>
          <div className={styles.actions}><button className={styles.button}>{copy.apply}</button>
            <button type='button' className={styles.secondary} onClick={() => navigate({})}>{copy.reset}</button></div>
        </form>
        <div className={`${styles.card} ${styles.tableWrap}`} aria-busy={resource.loading}>
          <table className={styles.table}>
            <thead><tr><th>{copy.orderNumber}</th><th>{copy.created}</th><th>{copy.orderStatus}</th>
              <th>{copy.paymentStatus}</th><th>{copy.fulfillmentStatus}</th><th>{copy.total}</th></tr></thead>
            <tbody>{resource.data?.items.map(order => <tr key={order.id}>
              <td><button className={styles.recordLink} onClick={() => navigate(filters, order.id)}
                aria-haspopup='dialog'>{order.orderNumber}</button></td>
              <td>{dateTime(order.createdAt)}</td><td><StatusTag status={order.orderStatus} copy={copy}/></td>
              <td><StatusTag status={order.paymentStatus} copy={copy}/></td>
              <td><StatusTag status={order.fulfillmentStatus} copy={copy}/></td>
              <td>{order.pricing.total === null ? '—' : money(order.pricing.total)}</td>
            </tr>)}</tbody>
          </table>
          {resource.data && !resource.loading && !resource.data.items.length && <p className={styles.empty}>{copy.noOrders}</p>}
        </div>
        <div className={styles.pagination}>
          {filters.cursor && <button className={styles.secondary} onClick={() => navigate(first)}>{copy.first}</button>}
          {resource.data?.nextCursor && <button className={styles.button}
            onClick={() => navigate({ ...filters, cursor: resource.data!.nextCursor! })}>{copy.next}</button>}
        </div>
      </>}
      <OrderDrawer id={selected} copy={copy} onClose={() => navigate(filters, null, true)}
        onChanged={async () => { await resource.reload(); }}/>
    </>
  );
};
