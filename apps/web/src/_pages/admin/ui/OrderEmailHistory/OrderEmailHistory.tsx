'use client';

import { useAdminMutation } from '../../model/useAdminMutation';
import { dateTime } from '../../model/types';
import styles from '../styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';

interface Props { order: OrderDetail; copy: AdminCopy; reload: () => Promise<void>; onBusyChange: (busy: boolean) => void }

export const OrderEmailHistory = (props: Props) => {
  const { order, copy, reload, onBusyChange } = props;
  const mutation = useAdminMutation(copy, reload, onBusyChange);
  const labels: Record<string, string> = copy.emailEvents;
  const states: Record<string, string> = copy.emailStates;

  return (
    <section className={styles.card}>
      <h2>{copy.emailHistory}</h2>
      {!order.emails?.length && <p className={styles.note}>{copy.noEmails}</p>}
      {mutation.error && <p className={styles.error} role='alert'>{mutation.error}</p>}
      {order.emails?.map(email => <article key={email.id} className={styles.refundEntry}>
        <strong>{labels[email.type] ?? email.type}</strong>
        <p>{email.audience === 'admin' ? copy.emailAdmin : copy.emailBuyer}</p>
        <p className={styles.note}>
          {states[email.status] ?? email.status} · {states[email.delivery] ?? email.delivery}
        </p>
        <p className={styles.note}>{dateTime(email.createdAt)} UTC · {copy.emailAttempts}: {email.attempts}</p>
        {email.lastErrorCode && <p className={styles.error}>{email.lastErrorCode}</p>}
        {email.status === 'unknown' && <p className={styles.note}>{copy.emailNeedsReview}</p>}
        {(email.status === 'failed' || (email.status === 'accepted' && email.delivery === 'failed')) &&
          <button className={styles.button} disabled={mutation.busy}
            onClick={() => void mutation.run(`/orders/${order.id}/notifications/${email.id}/retry`, {})}>
            {mutation.busy ? copy.saving : copy.emailRetry}
          </button>}
      </article>)}
    </section>
  );
};
