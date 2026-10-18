import Link from 'next/link';

import { product } from '@/entities/product';
import { money } from '@/shared/lib/money';

import styles from './styles.module.scss';

import type { GuestOrder } from '@/entities/order';
import type { Dictionary } from '@/shared/config/i18n';

interface Props { order: GuestOrder; copy: Dictionary['commerce'] }
export const OrderResult = (props: Props) => {
  const { order, copy } = props;

  const fulfillment: Record<string, string> = {
    unfulfilled: copy.unfulfilled, processing: copy.processing, shipped: copy.shipped,
    delivered: copy.delivered, cancelled: copy.cancelled,
  };

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>{copy.orderEyebrow}</p>
        <div className={styles.check} aria-hidden='true'>✓</div>
        <h1>{copy.orderTitle}</h1><p className={styles.description}>{copy.orderDescription}</p>
        <dl className={styles.details}>
          <div><dt>{copy.orderNumber}</dt><dd>{order.orderNumber}</dd></div>
          <div><dt>{copy.orderStatus}</dt><dd>
            {order.paymentStatus === 'paid' ? copy.paid : order.paymentStatus}
          </dd></div>
          <div><dt>{copy.fulfillmentStatus}</dt><dd>{fulfillment[order.fulfillmentStatus] ?? order.fulfillmentStatus}</dd></div>
        </dl>
        <div className={styles.selection}>
          <h2>{copy.orderItems}</h2>
          {order.items.map(item => <div className={styles.line} key={item.sku}>
            <span>{item.name}<small>{copy.quantity}: {item.quantity} · {money(item.unitAmount)}</small></span>
            <strong>{money(item.lineSubtotal)}</strong>
          </div>)}
          <div className={styles.total}><span>{copy.subtotal}</span><strong>{money(order.pricing.subtotal)}</strong></div>
        </div>
        <Link className={styles.back} href={product.path}>{copy.backToProduct} ↗</Link>
      </section>
    </main>
  );
};
