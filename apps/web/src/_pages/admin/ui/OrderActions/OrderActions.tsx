'use client';

import { useState } from 'react';

import { useAdminMutation } from '../../model/useAdminMutation';
import { OrderPaymentActions } from '../OrderPaymentActions';
import styles from '../styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';
import type { FormEvent } from 'react';

interface Props { order: OrderDetail; copy: AdminCopy; reload: () => Promise<void>; onBusyChange: (busy: boolean) => void }

export const OrderActions = (props: Props) => {
  const { order, copy, reload, onBusyChange } = props;
  const mutation = useAdminMutation(copy, reload, onBusyChange);
  const [validation, setValidation] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const stages: Record<string, string> = { unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered' };
  const labels: Record<string, string> = { processing: copy.processing, shipped: copy.ship, delivered: copy.deliver };
  const next = stages[order.fulfillmentStatus];

  const eligible = order.orderStatus === 'open' && order.paymentStatus === 'paid'
    && !order.cancellationRequest && !order.reconciliationRequired && !order.disputed
    && !!order.customer && !!order.shippingAddress;

  const shipped = ['shipped', 'delivered'].includes(order.fulfillmentStatus);

  const canRestock = order.cancellationRequest?.status !== 'pending' && !order.disputed
    && !order.reconciliationRequired && (shipped || order.orderStatus === 'cancelled');

  const remaining = order.items.filter(item => item.quantity > (order.restockedQuantities[item.sku] ?? 0));

  const advance = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);

    const saved = await mutation.run(`/orders/${order.id}/fulfillment`, {
      version: order.version, status: next,
      ...(next === 'shipped' ? { carrier: String(fields.get('carrier')), trackingNumber: String(fields.get('tracking')) } : {}),
    }, 'PATCH');

    if (saved) form.reset();
  };

  const restock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);

    const items = remaining.map(item => ({ sku: item.sku, quantity: Number(fields.get(item.sku)) }))
      .filter(item => item.quantity > 0);

    setValidation('');

    if (!items.length) { setValidation(copy.restockEmpty); return; }

    const saved = await mutation.run(`/orders/${order.id}/restock`, {
      version: order.version, reason: String(fields.get('reason')), items,
      returnedAndSellable: fields.get('returned') === 'on',
    });

    if (saved) form.reset();
  };

  return (
    <section className={styles.card}>
      <h2>{copy.manageOrder}</h2>
      {(mutation.error || validation) && <p className={styles.error} role='alert'>{validation || mutation.error}</p>}
      {mutation.saved && <p className={styles.success} role='status'>{copy.saved}</p>}
      <fieldset disabled={mutation.busy || paymentBusy} className={`${styles.fieldset} ${styles.stack}`}>
        {next && eligible && <form className={styles.form} onSubmit={advance}>
          {next === 'shipped' && <>
            <label className={styles.field}>{copy.carrier}<input name='carrier' required maxLength={100}/></label>
            <label className={styles.field}>{copy.tracking}<input name='tracking' required maxLength={200}/></label>
          </>}
          <button className={styles.button}>{mutation.busy ? copy.saving : labels[next]}</button>
        </form>}
        {next && !eligible && <p className={styles.note}>{copy.fulfillmentBlocked}</p>}
        <OrderPaymentActions order={order} copy={copy} reload={reload} onBusyChange={busy => {
          setPaymentBusy(busy); onBusyChange(busy);
        }}/>
        {canRestock && remaining.length > 0 && <details className={styles.disclosure}>
          <summary>{copy.restock}</summary>
          <form className={styles.form} onSubmit={restock}>
            {remaining.map(item => <label className={styles.field} key={item.sku}>{item.name}
              <input name={item.sku} type='number' min='0'
                max={item.quantity - (order.restockedQuantities[item.sku] ?? 0)} step='1' defaultValue='0' required/>
              <small>{copy.restocked}: {order.restockedQuantities[item.sku] ?? 0}</small>
            </label>)}
            {shipped && <label className={styles.check}><input type='checkbox' name='returned' required/>{copy.returned}</label>}
            <label className={styles.field}>{copy.reason}<textarea name='reason' required maxLength={500}/></label>
            <button className={styles.secondary}>{copy.restock}</button>
          </form>
        </details>}
      </fieldset>
    </section>
  );
};
