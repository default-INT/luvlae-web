import { useState } from 'react';

import { priceInCents } from '../../../../model/types';
import styles from '../../../styles.module.scss';
import { useProductForm } from '../../utils/useProductForm';
import { ProductFormStatus } from '../ProductFormStatus';

import type { AdminCopy, AdminProduct } from '../../../../model/types';
import type { ProductOfferSnapshot } from '@/entities/product';
import type { FormEvent } from 'react';

interface Props {
  product: AdminProduct; offer?: ProductOfferSnapshot; copy: AdminCopy; busy: boolean;
  reload: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}

export const OfferForm = (props: Props) => {
  const { product, offer, copy, busy, reload, onBusyChange } = props;
  const ui = copy.catalogUi;
  const [units, setUnits] = useState(String(offer?.unitsPerPack ?? 2));
  const [price, setPrice] = useState(offer ? (offer.price.unitAmount / 100).toFixed(2) : '');
  const [sortOrder, setSortOrder] = useState(String(offer?.sortOrder ?? 0));
  const form = useProductForm(copy, product.version, reload, onBusyChange);
  const unitAmount = priceInCents(price);
  const boxes = Number(units);
  const validUnits = Number.isSafeInteger(boxes) && boxes >= 1 && boxes <= 99;
  const available = validUnits ? Math.floor(product.availableQuantity / boxes) : 0;
  const archived = offer?.status === 'archived';
  const money = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount / 100);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const reason = String(fields.get('reason') ?? '').trim();
    const action = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value ?? 'save';
    const base = `/products/${product.sku}/offers`;
    const body = { version: form.version, reason };

    if (!reason) { form.setValidation(copy.reasonRequired); return; }

    if (action === 'duplicate' && offer) {
      await form.run(`${base}/${offer.id}/duplicate`, body); return;
    }

    if (action === 'archive' && offer) {
      await form.run(`${base}/${offer.id}`, { ...body, status: 'archived' }, 'PATCH'); return;
    }

    if (!validUnits || !Number.isSafeInteger(Number(sortOrder)) || Number(sortOrder) < 0 || Number(sortOrder) > 9999) {
      form.setValidation(ui.invalidOffer); return;
    }

    if (unitAmount === null || unitAmount > 99999999) { form.setValidation(copy.invalidPrice); return; }

    await form.run(offer ? `${base}/${offer.id}` : base, {
      ...body, unitsPerPack: boxes, unitAmount, sortOrder: Number(sortOrder),
      ...(action === 'publish' ? { status: 'active' } : {}),
    }, offer ? 'PATCH' : 'POST');
  };

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h2>{offer ? `${ui.offer} · ${offer.unitsPerPack} ${ui.boxes}` : ui.createOffer}</h2>
      {offer && (
        <p className={styles.note}>
          {offer.id} · {ui.statuses[offer.status]} · {ui.savedPack}: {offer.unitsPerPack} {ui.boxes}
          {' · '}{money(offer.price.unitAmount)} · {ui.sortOrder}: {offer.sortOrder}
        </p>
      )}
      <fieldset className={`${styles.fieldset} ${styles.form}`} disabled={busy}>
        <label className={styles.field}>{ui.unitsPerPack}<input type='number' step='1' min='1' max='99' required
          value={units} disabled={archived || form.locked} onChange={event => setUnits(event.target.value)}/></label>
        <label className={styles.field}>{ui.packTotal}<input type='number' min='0.01' max='999999.99' step='0.01' required
          value={price} disabled={archived || form.locked} onChange={event => setPrice(event.target.value)}/></label>
        <label className={styles.field}>{ui.sortOrder}<input type='number' min='0' max='9999' step='1' required
          value={sortOrder} disabled={archived || form.locked} onChange={event => setSortOrder(event.target.value)}/></label>
        <dl className={styles.details}>
          <div><dt>{ui.previewBoxes}</dt><dd>{validUnits ? boxes : '—'}</dd></div>
          <div><dt>{ui.previewPatches}</dt><dd>{validUnits ? boxes * 60 : '—'}</dd></div>
          <div><dt>{ui.boxPrice}</dt><dd>{validUnits && unitAmount !== null ? money(unitAmount / boxes) : '—'}</dd></div>
          <div><dt>{ui.packTotal}</dt><dd>{unitAmount !== null ? money(unitAmount) : '—'}</dd></div>
          <div><dt>{ui.previewAvailable}</dt><dd>{available}</dd></div>
          <div><dt>{ui.purchasable}</dt><dd>{offer?.status === 'active' && product.salesEnabled && available > 0
            ? copy.enabled : copy.disabled}</dd></div>
        </dl>
        <p className={styles.note}>{ui.previewNote}</p>
        <label className={styles.field}>{copy.reason}
          <textarea disabled={form.locked} name='reason' required maxLength={500}/></label>
        <ProductFormStatus form={form} currentVersion={product.version} copy={copy} busy={busy}/>
        <div className={styles.actions}>
          {!archived && <button className={styles.button} value='save'
            disabled={form.locked || form.version !== product.version}>{offer ? copy.save : ui.createDraft}</button>}
          {offer?.status === 'draft' && <button className={styles.secondary} value='publish'
            disabled={form.locked || form.version !== product.version}>{ui.publish}</button>}
          {offer && !archived && <button className={styles.danger} value='archive' formNoValidate
            disabled={form.locked || form.version !== product.version}>{ui.archive}</button>}
          {offer && <button className={styles.secondary} value='duplicate' formNoValidate
            disabled={form.locked || form.version !== product.version}>{ui.duplicate}</button>}
        </div>
      </fieldset>
    </form>
  );
};
