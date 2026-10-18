'use client';

import { useEffect, useRef, useState } from 'react';

import { useAdminResource } from '../../model/useAdminResource';
import { DataStatus } from '../DataStatus';
import { OrderDetails } from '../OrderDetails';

import styles from './styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';

interface Props { id: string | null; copy: AdminCopy; onClose: () => void; onChanged: () => Promise<void> }
export const OrderDrawer = (props: Props) => {
  const { id, copy, onClose, onChanged } = props;
  const resource = useAdminResource<OrderDetail>(id ? `/orders/${id}` : null, copy);
  const [savingOrders, setSavingOrders] = useState<Record<string, boolean>>({});
  const saving = !!id && !!savingOrders[id];
  const dialog = useRef<HTMLDialogElement>(null);
  const open = !!id;
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) { element.close(); return; }
    if (!element.open) element.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const reload = async () => {
    await resource.reload();
    await onChanged();
  };

  return (
    <dialog ref={dialog} className={styles.drawer} aria-labelledby='admin-order-title'
      onCancel={event => { if (saving) event.preventDefault(); else onClose(); }}
      onPointerDown={event => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (!saving && (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom)) onClose();
      }}>
      <header className={styles.header}>
        <div><p>{copy.orderNumber}</p><h2 id='admin-order-title'>{resource.data?.orderNumber ?? copy.view}</h2></div>
        <button type='button' className={styles.close} disabled={saving} onClick={onClose} aria-label={copy.closeOrder}>×</button>
      </header>
      <div className={styles.content} aria-busy={resource.loading || saving}>
        <DataStatus loading={resource.loading && !resource.data} error={resource.error} copy={copy}
          onRetry={() => { void resource.reload(); }}/>
        {resource.data && <OrderDetails order={resource.data} copy={copy} reload={reload}
          onBusyChange={busy => { if (id) setSavingOrders(previous => ({ ...previous, [id]: busy })); }} key={id}/>}
      </div>
    </dialog>
  );
};
