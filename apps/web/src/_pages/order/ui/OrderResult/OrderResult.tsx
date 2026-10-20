import Link from 'next/link';

import { OrderCartSync } from '@/features/shopping-cart';
import { product } from '@/entities/product';
import { money } from '@/shared/lib/money';

import { OrderPaymentStatus } from '../OrderPaymentStatus';

import styles from './styles.module.scss';

import type { GuestOrder } from '@/entities/order';
import type { Dictionary } from '@/shared/config/i18n';

interface Props { id: string; order: GuestOrder; copy: Dictionary['commerce'] }

export const OrderResult = (props: Props) => {
  const { id, order, copy } = props;

  const fulfillment: Record<string, string> = {
    unfulfilled: copy.unfulfilled, processing: copy.processing, shipped: copy.shipped,
    delivered: copy.delivered, cancelled: copy.cancelled,
  };

  const paid = ['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus);
  const terminal = ['failed', 'expired'].includes(order.paymentStatus);

  const unpaidCopy = terminal
    ? { title: copy.orderUnpaidTitle, description: copy.orderUnpaidDescription }
    : { title: copy.paymentPendingTitle, description: copy.paymentPendingDescription };

  const { title, description } = paid ? { title: copy.orderTitle, description: copy.orderDescription } : unpaidCopy;

  const paymentLabels: Record<string, string> = {
    paid: copy.paid, pending: copy.paymentPending, processing: copy.processing,
    failed: copy.paymentFailed, expired: copy.paymentExpired,
    partially_refunded: copy.partiallyRefunded, refunded: copy.refunded,
  };

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{copy.orderEyebrow}</p>
        <div className={styles.check} aria-hidden='true'>{paid ? '✓' : '↻'}</div>
        <h1>{title}</h1><p className={styles.description}>{description}</p>
        <OrderPaymentStatus id={id} paymentStatus={order.paymentStatus} copy={copy}/>
        <OrderCartSync id={id} paymentStatus={order.paymentStatus} items={order.items}/>
        <dl className={styles.details}>
          <div><dt>{copy.orderNumber}</dt><dd>{order.orderNumber}</dd></div>
          <div><dt>{copy.orderStatus}</dt><dd>
            {paymentLabels[order.paymentStatus] ?? order.paymentStatus}
          </dd></div>
          <div><dt>{copy.fulfillmentStatus}</dt><dd>{fulfillment[order.fulfillmentStatus] ?? order.fulfillmentStatus}</dd></div>
        </dl>
        <div className={styles.selection}>
          <h2>{copy.orderItems}</h2>
          {order.items.map(item => <div className={styles.line} key={item.sku}>
            <span>{item.name}<small>{copy.quantity}: {item.quantity} · {money(item.unitAmount)}</small></span>
            <strong>{money(item.lineSubtotal)}</strong>
          </div>)}
          <div className={styles.total}>
            <span>{copy.total}</span><strong>{money(order.pricing.total ?? order.pricing.subtotal)}</strong>
          </div>
        </div>
        <Link className={styles.back} href={product.path}>{copy.backToProduct} ↗</Link>
      </section>
    </main>
  );
};
