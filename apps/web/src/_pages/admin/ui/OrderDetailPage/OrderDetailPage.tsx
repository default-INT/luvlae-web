'use client';

import Link from 'next/link';
import { useState } from 'react';

import { money } from '@/shared/lib/money';

import { adminRequest } from '../../api/admin';
import { dateTime } from '../../model/types';
import { OrderActions } from '../OrderActions';
import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';

interface Props { initialOrder: OrderDetail; copy: AdminCopy }
export const OrderDetailPage = (props: Props) => {
  const { initialOrder, copy } = props;
  const [order, setOrder] = useState(initialOrder);
  const reload = async () => setOrder(await adminRequest<OrderDetail>(`/orders/${order.id}`));
  const address = order.shippingAddress;

  const totals = [
    { label: copy.subtotal, value: order.pricing.subtotal }, { label: copy.discount, value: order.pricing.discount },
    { label: copy.shipping, value: order.pricing.shipping }, { label: copy.tax, value: order.pricing.tax },
    { label: copy.total, value: order.pricing.total },
  ];

  return (
    <>
      <div className={styles.pageHeader}>
        <Link href='/admin/orders'>← {copy.backOrders}</Link><h1>{order.orderNumber}</h1>
        <p>{dateTime(order.createdAt)} UTC</p>
        <div className={styles.row}>
          <span>{copy.orderStatus}: <StatusTag status={order.orderStatus} copy={copy}/></span>
          <span>{copy.paymentStatus}: <StatusTag status={order.paymentStatus} copy={copy}/></span>
          <span>{copy.fulfillmentStatus}: <StatusTag status={order.fulfillmentStatus} copy={copy}/></span>
        </div>
      </div>
      <div className={styles.columns}>
        <div className={styles.stack}>
          <section className={styles.card}>
            <h2>{copy.items}</h2>
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>{copy.name}</th><th>{copy.quantity}</th><th>{copy.unitPrice}</th><th>{copy.total}</th></tr></thead>
              <tbody>{order.items.map(item => <tr key={item.sku}>
                <td>{item.name}<small>{item.sku}</small></td><td>{item.quantity}</td>
                <td>{money(item.unitAmount)}</td><td>{money(item.lineSubtotal)}</td>
              </tr>)}</tbody>
            </table></div>
            <div className={styles.summary}>{totals.map(total => <div key={total.label}>
              <span>{total.label}</span><strong>{total.value === null ? '—' : money(total.value)}</strong>
            </div>)}</div>
          </section>
          <section className={styles.card}>
            <h2>{copy.customer}</h2>
            <div className={styles.address}>{order.customer ? <>
              <strong>{order.customer.name}</strong><br/>{order.customer.email}
              {order.customer.phone && <><br/>{order.customer.phone}</>}
            </> : copy.notProvided}</div>
          </section>
          <section className={styles.card}>
            <h2>{copy.deliveryAddress}</h2>
            <address className={styles.address}>{address ? <>
              {address.recipientName}<br/>{address.line1}<br/>{address.line2 && <>{address.line2}<br/></>}
              {address.city}, {address.state} {address.postalCode}<br/>{address.country}
            </> : copy.notProvided}</address>
            {order.fulfillment.trackingNumber && <p className={styles.note}>
              {copy.carrier}: {order.fulfillment.carrier}<br/>{copy.tracking}: {order.fulfillment.trackingNumber}
            </p>}
          </section>
          {order.cancellation && <section className={styles.card}><h2>{copy.cancellation}</h2>
            <p>{order.cancellation.reason}</p><p className={styles.note}>{dateTime(order.cancellation.cancelledAt)} UTC</p>
          </section>}
        </div>
        <OrderActions order={order} copy={copy} reload={reload}/>
      </div>
    </>
  );
};
