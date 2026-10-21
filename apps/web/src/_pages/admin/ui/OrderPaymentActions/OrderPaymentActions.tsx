'use client';

import { useRef, useState } from 'react';

import { money } from '@/shared/lib/money';
import { Spinner } from '@/shared/ui/Spinner';

import { activeOrderRefund, recoverOrderPaymentRequest } from '../../model/order-refunds';
import { useAdminMutation } from '../../model/useAdminMutation';
import styles from '../styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';
import type { OrderPaymentRequest } from '../../model/order-refunds';
import type { FormEvent } from 'react';

interface Props { order: OrderDetail; copy: AdminCopy; reload: () => Promise<void>; onBusyChange: (busy: boolean) => void }

export const OrderPaymentActions = (props: Props) => {
  const { order, copy, reload, onBusyChange } = props;
  const mutation = useAdminMutation(copy, reload, onBusyChange);
  const [attempt, setAttempt] = useState<OrderPaymentRequest | null>(null);
  const executing = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const [validation, setValidation] = useState('');
  const active = activeOrderRefund(order);
  const recovery = recoverOrderPaymentRequest(order);
  const previous = order.refunds.find(refund => refund.operationId === attempt?.operationId);
  const terminal = previous && ['succeeded', 'failed', 'cancelled'].includes(previous.status);
  const localRecovery = uncertain && mutation.uncertain && !terminal && !active;
  const canStart = order.canCancel || order.canRefund;
  const kind = order.canCancel ? 'cancel' : 'refund';
  const label = kind === 'cancel' ? copy.cancellation : copy.refund;

  const execute = async (request: OrderPaymentRequest) => {
    if (executing.current) return;

    executing.current = true;
    setAttempt(request);
    setValidation('');

    const accepted = await mutation.run(`/orders/${order.id}/${request.kind}`, {
      version: request.version, reason: request.reason, operationId: request.operationId,
    });

    setUncertain(!accepted);

    if (!accepted) await reload().catch(() => {});

    executing.current = false;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const reason = String(fields.get('reason') ?? '').trim();

    if (!reason) { setValidation(copy.reasonRequired); return; }

    await execute({ operationId: crypto.randomUUID(), version: order.version, reason, kind });
  };

  const resume = () => {
    if (recovery) { void execute(recovery); return; }

    if (localRecovery && attempt) void execute(attempt);
  };

  return (
    <div className={styles.stack}>
      {(mutation.error || validation) && <p className={styles.error} role='alert'>{validation || mutation.error}</p>}
      {mutation.saved && <p className={styles.note} role='status'>{copy.paymentRequestAccepted}</p>}
      {order.cancellationRequest?.status === 'pending' && <p className={styles.note} role='status'>
        {copy.cancellationPending}
      </p>}
      {(active || localRecovery || recovery) && <div className={styles.form}>
        <p className={styles.note} role='status'>{active?.status === 'pending' ? copy.refundPending : copy.refundUncertain}</p>
        <div className={styles.actions}>
          {(recovery || localRecovery) && <button type='button' className={styles.secondary}
            onClick={resume} disabled={mutation.busy}>
            {mutation.busy ? <Spinner label={copy.saving}/> : copy.resumePaymentOperation}
          </button>}
          <button type='button' className={styles.secondary} disabled={mutation.busy}
            onClick={() => { void reload(); }}>{copy.refresh}</button>
        </div>
      </div>}
      {canStart && !localRecovery && !active && <details className={styles.disclosure}>
        <summary>{order.cancellationRequest?.status === 'pending' ? copy.retryCancellation : label}</summary>
        <form className={styles.form} onSubmit={submit}>
          <fieldset disabled={mutation.busy} className={`${styles.fieldset} ${styles.form}`}>
            <p className={styles.note}>{kind === 'cancel' ? copy.cancellationNote : copy.refundNote}</p>
            {order.payment.provider === 'mock' && <p className={styles.note}>{copy.mockRefundNote}</p>}
            <dl className={styles.details}>
              <div><dt>{copy.refundAmount}</dt><dd>{money(order.refundableAmount)}</dd></div>
            </dl>
            {order.refundableAmount === 0 && <p className={styles.note}>{copy.cancelWithoutRefund}</p>}
            <label className={styles.field}>{copy.reason}
              <textarea name='reason' required maxLength={500} defaultValue={order.cancellationRequest?.reason ?? ''}/>
            </label>
            <label className={styles.check}><input name='confirmed' type='checkbox' required/>
              {kind === 'cancel' ? copy.confirmCancellation : copy.confirmRefund}
            </label>
            <button className={styles.danger}>
              {mutation.busy ? <Spinner label={copy.saving}/> : label}
            </button>
          </fieldset>
        </form>
      </details>}
    </div>
  );
};
