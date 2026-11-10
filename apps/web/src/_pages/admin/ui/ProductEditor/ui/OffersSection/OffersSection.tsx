import { useRef, useState } from 'react';

import { Drawer } from '@/shared/ui/Drawer';

import common from '../../../styles.module.scss';
import { useProductForm } from '../../utils/useProductForm';
import { OfferForm } from '../OfferForm';
import { ProductFormStatus } from '../ProductFormStatus';

import styles from './styles.module.scss';

import type { AdminCopy, AdminProduct } from '../../../../model/types';
import type { ProductOfferSnapshot } from '@/entities/product';

interface Props {
  product: AdminProduct; copy: AdminCopy; busy: boolean;
  reload: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}

export const OffersSection = (props: Props) => {
  const { product, copy, busy } = props;
  const ui = copy.catalogUi;
  const tabs = ['all', 'active', 'archived', 'draft'] as const;
  const [status, setStatus] = useState<typeof tabs[number]>('active');
  const tabLabels = { all: ui.allOffers, active: ui.statuses.active, archived: ui.statuses.archived, draft: ui.drafts };
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [drawerLocked, setDrawerLocked] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);

  const form = useProductForm(copy, product.version, async () => {
    await props.reload();
    setOrder(null);
  }, props.onBusyChange);

  const offers = product.offers ?? [];
  const sorted = [...offers].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const editable = sorted.filter(offer => offer.status !== 'archived');
  const ids = order ?? editable.map(offer => offer.id);

  const group = sorted.filter(offer => status === 'all' || offer.status === status).sort((a, b) => {
    const position = (offer: ProductOfferSnapshot) => order && offer.status !== 'archived'
      ? ids.indexOf(offer.id) : offer.sortOrder;

    return position(a) - position(b) || a.id.localeCompare(b.id);
  });

  const selectedOffer = offers.find(offer => offer.id === selected);
  const disabled = busy || form.locked || open;

  const money = (offer: ProductOfferSnapshot) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: offer.price.currency,
  }).format(offer.price.unitAmount / 100);

  const move = (id: string, target: string) => {
    if (disabled || id === target) return;

    const sourceOffer = offers.find(offer => offer.id === id);
    const targetOffer = offers.find(offer => offer.id === target);

    if (!sourceOffer || sourceOffer.status === 'archived' || sourceOffer.status !== targetOffer?.status) return;

    if (!order) form.setVersion(product.version);

    const next = [...ids];
    next.splice(next.indexOf(id), 1);
    next.splice(ids.indexOf(target), 0, id);
    setOrder(next);
    setAnnouncement(`${sourceOffer.unitsPerPack} ${ui.boxes} · ${ui.sortOrder}: ${next.indexOf(id)}`);
  };

  const show = (id: string) => { setSelected(id); setOpen(true); };

  return (
    <section className={`${common.card} ${styles.section}`} aria-labelledby='additional-offers-title'>
      <header className={styles.heading}>
        <div><h2 id='additional-offers-title'>{ui.offers}</h2><p className={common.note}>{ui.offersNote}</p></div>
        <button type='button' className={common.button} disabled={busy || !!order || form.locked}
          onClick={() => show('new')}>{ui.createOffer}</button>
      </header>
      <p id='offer-order-help' className={common.note}>{ui.reorderHelp}</p>
      <div className={styles.tabs} role='tablist' aria-label={ui.offerStatus}>
        {tabs.map((tab, index) => (
          <button key={tab} type='button' role='tab' id={`offer-tab-${tab}`} aria-controls='offer-status-panel'
            aria-selected={status === tab} tabIndex={status === tab ? 0 : -1}
            className={status === tab ? styles.selectedTab : undefined} onClick={() => setStatus(tab)}
            onKeyDown={event => {
              let next = index;

              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;

              event.preventDefault();
              setStatus(tabs[next]);
              event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
            }}>
            {tabLabels[tab]} <span>{offers.filter(offer => tab === 'all' || offer.status === tab).length}</span>
          </button>
        ))}
      </div>
      <div className={styles.group} role='tabpanel' id='offer-status-panel' aria-labelledby={`offer-tab-${status}`}>
        {group.length === 0 ? <p className={styles.empty}>{ui.noOffers}</p> : (
          <div className={common.tableWrap}>
            <table className={`${common.table} ${styles.table}`}>
              <caption className={styles.srOnly}>{tabLabels[status]} · {ui.offers}</caption>
              <thead><tr><th scope='col'>{ui.offerStatus}</th><th scope='col'>{ui.unitsPerPack}</th>
                <th scope='col'>{ui.packTotal}</th><th scope='col'>{ui.sortOrder}</th></tr></thead>
              <tbody>{group.map(offer => (
                <tr key={offer.id} data-offer-id={offer.id}
                  className={dropTarget === offer.id ? styles.dropTarget : undefined}
                  onClick={() => { if (!busy && !order && !form.locked) show(offer.id); }}>
                  <td><span className={`${styles.badge} ${styles[offer.status]}`}>{ui.statuses[offer.status]}</span></td>
                  <td><button type='button' className={common.recordLink} disabled={busy || !!order || form.locked}
                    onClick={event => { event.stopPropagation(); show(offer.id); }}>
                    {offer.unitsPerPack} {ui.boxes}</button></td>
                  <td>{money(offer)}</td>
                  <td><div className={styles.order}>
                    <span>{order && offer.status !== 'archived' ? ids.indexOf(offer.id) : offer.sortOrder}</span>
                    {offer.status !== 'archived' && <button type='button' className={styles.handle} disabled={disabled}
                      aria-label={`${ui.reorderOffer}: ${offer.unitsPerPack} ${ui.boxes}`} aria-describedby='offer-order-help'
                      onClick={event => event.stopPropagation()}
                      onPointerDown={event => {
                        if (event.button !== 0) return;

                        dragging.current = offer.id;
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={event => {
                        if (dragging.current !== offer.id) return;

                        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-offer-id]');
                        const id = target?.getAttribute('data-offer-id');
                        const sameStatus = offers.find(item => item.id === id)?.status === offer.status;
                        setDropTarget(id && id !== offer.id && sameStatus ? id : null);
                      }}
                      onPointerUp={event => {
                        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-offer-id]');
                        const id = target?.getAttribute('data-offer-id');

                        if (dragging.current === offer.id && id) move(offer.id, id);

                        dragging.current = null;
                        setDropTarget(null);
                      }}
                      onPointerCancel={() => { dragging.current = null; setDropTarget(null); }}
                      onKeyDown={event => {
                        const offset = ({ ArrowUp: -1, ArrowDown: 1 } as Record<string, number>)[event.key] ?? 0;

                        if (!offset) return;

                        event.preventDefault();

                        const siblings = group.filter(item => item.status === offer.status);
                        const target = siblings[siblings.findIndex(item => item.id === offer.id) + offset];

                        if (target) move(offer.id, target.id);
                      }}>⠿</button>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>
      <span role='status' className={styles.srOnly}>{announcement}</span>
      {order && <form className={common.form} onSubmit={async event => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get('reason') ?? '').trim();

        if (!reason) { form.setValidation(copy.reasonRequired); return; }

        await form.run(`/products/${product.sku}/offers/reorder`, {
          version: form.version, reason, offerIds: order,
        }, 'PATCH');
      }}>
        <label className={common.field}>{copy.reason}<textarea name='reason' required maxLength={500}
          disabled={busy || form.locked}/></label>
        <ProductFormStatus form={form} currentVersion={product.version} copy={copy} busy={busy}/>
        <div className={common.actions}>
          <button className={common.button} disabled={busy || form.locked || form.version !== product.version}>
            {ui.saveOrder}</button>
          <button type='button' className={common.secondary} disabled={busy || form.locked} onClick={() => setOrder(null)}>
            {ui.resetOrder}</button>
        </div>
      </form>}
      <Drawer open={open} onClose={() => setOpen(false)} closeDisabled={busy || drawerLocked}
        onAfterClose={() => { setSelected(null); setDrawerLocked(false); }}
        labelledBy='admin-offer-title' className={styles.drawer}>
        <header className={styles.drawerHeader}>
          <h2 id='admin-offer-title'>
            {selectedOffer ? `${ui.offer} · ${selectedOffer.unitsPerPack} ${ui.boxes}` : ui.createOffer}</h2>
          <button type='button' className={styles.close} aria-label={ui.closeOffer} disabled={busy || drawerLocked}
            onClick={() => setOpen(false)}>×</button>
        </header>
        <div className={styles.content}>
          {selected && <OfferForm key={selected} {...props} offer={selectedOffer} onLockedChange={setDrawerLocked}/>}
        </div>
      </Drawer>
    </section>
  );
};
