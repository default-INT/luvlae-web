'use client';

import { useState } from 'react';

import { Drawer } from '@/shared/ui/Drawer';

import { useAdminResource } from '../../model/useAdminResource';
import { DataStatus } from '../DataStatus';
import { OrderDetails } from '../OrderDetails';

import styles from './styles.module.scss';

import type { AdminCopy, OrderDetail } from '../../model/types';

interface Props { id: string | null; copy: AdminCopy; onClose: () => void; onChanged: () => Promise<void> }

export const OrderDrawer = (props: Props) => {
  const { id, copy, onClose, onChanged } = props;
  const [retainedId, setRetainedId] = useState(id);
  const [savingOrders, setSavingOrders] = useState<Record<string, boolean>>({});
  const saving = !!retainedId && !!savingOrders[retainedId];

  if (id && id !== retainedId && !saving) setRetainedId(id);

  const displayedId = saving ? retainedId : id ?? retainedId;
  const resource = useAdminResource<OrderDetail>(displayedId ? `/orders/${displayedId}` : null, copy);

  const reload = async () => {
    await resource.reload();
    await onChanged();
  };

  return (
    <Drawer open={!!id || saving} onClose={onClose} onAfterClose={() => setRetainedId(null)} closeDisabled={saving}
      className={styles.drawer} labelledBy='admin-order-title'>
      <header className={styles.header}>
        <div><p>{copy.orderNumber}</p><h2 id='admin-order-title'>{resource.data?.orderNumber ?? copy.view}</h2></div>
        <button type='button' className={styles.close} disabled={saving} onClick={onClose} aria-label={copy.closeOrder}>×</button>
      </header>
      <div className={styles.content} aria-busy={resource.loading || saving}>
        <DataStatus loading={resource.loading && !resource.data} error={resource.error} copy={copy} skeleton
          onRetry={() => { void resource.reload(); }}/>
        {resource.data && <OrderDetails order={resource.data} copy={copy} reload={reload}
          onBusyChange={busy => {
            if (displayedId) setSavingOrders(previous => ({ ...previous, [displayedId]: busy }));
          }} key={displayedId}/>}
      </div>
    </Drawer>
  );
};
