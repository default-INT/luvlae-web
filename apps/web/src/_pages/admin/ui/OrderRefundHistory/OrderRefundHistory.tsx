import { money } from '@/shared/lib/money';

import { dateTime } from '../../model/types';
import { StatusTag } from '../StatusTag';
import styles from '../styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';

interface Props { order: OrderDetail; copy: AdminCopy }

export const OrderRefundHistory = (props: Props) => {
  const { order, copy } = props;
  const refunds = order.refunds.filter(refund => refund.amount > 0);

  if (!refunds.length) return null;

  const sources: Record<string, string> = copy.refundSources;
  const reasons: Record<string, string> = copy.stripeRefundReasons;

  return (
    <section className={styles.card}>
      <h2>{copy.refundHistory}</h2>
      <dl className={styles.details}>
        <div><dt>{copy.amountPaid}</dt><dd>{money(order.payment.amountPaid)}</dd></div>
        <div><dt>{copy.amountRefunded}</dt><dd>{money(order.payment.amountRefunded)}</dd></div>
        <div><dt>{copy.refundableAmount}</dt><dd>{money(order.refundableAmount)}</dd></div>
      </dl>
      {refunds.map(refund => <article key={refund.id} className={styles.refundEntry}>
        <div className={styles.row}><strong>{money(refund.amount)}</strong><StatusTag status={refund.status} copy={copy}/></div>
        <p className={styles.note}>{sources[refund.source]} · {dateTime(refund.createdAt)} UTC</p>
        <p>{refund.kind === 'cancel' ? copy.cancellation : copy.refund}</p>
        <p className={styles.refundReason}>{copy.reason}: {refund.reason ?? copy.notProvided}</p>
        {refund.providerReason && <p className={styles.note}>
          {copy.stripeReason}: {reasons[refund.providerReason] ?? refund.providerReason}
        </p>}
        {refund.providerRefundId && <p className={styles.refundReference}>{copy.refundReference}: {refund.providerRefundId}</p>}
        {refund.failureReason && <p className={styles.error}>{copy.refundFailure}: {refund.failureReason}</p>}
      </article>)}
    </section>
  );
};
