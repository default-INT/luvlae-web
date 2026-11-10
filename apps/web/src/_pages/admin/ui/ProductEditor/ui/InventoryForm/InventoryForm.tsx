import { useState } from 'react';

import styles from '../../../styles.module.scss';
import { useProductForm } from '../../utils/useProductForm';
import { ProductFormStatus } from '../ProductFormStatus';

import type { AdminCopy, AdminProduct } from '../../../../model/types';
import type { FormEvent } from 'react';

interface Props {
  product: AdminProduct; copy: AdminCopy; busy: boolean;
  reload: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}

export const InventoryForm = (props: Props) => {
  const { product, copy, busy, reload, onBusyChange } = props;
  const [mode, setMode] = useState<'delta' | 'set'>('delta');
  const [quantity, setQuantity] = useState('');
  const version = product.inventory.version ?? 1;
  const form = useProductForm(copy, version, reload, onBusyChange);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const amount = Number(quantity);

    if (!quantity || !Number.isSafeInteger(amount) || (mode === 'set' && amount < 0)) {
      form.setValidation(copy.catalogUi.invalidQuantity); return;
    }

    await form.run(`/products/${product.sku}/inventory/adjustments`, {
      mode, quantity: amount, expectedInventoryVersion: form.version, reason: fields.get('reason'),
    });
  };

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h2>{copy.inventory}</h2>
      <p className={styles.note}>{copy.catalogUi.inventoryNote}</p>
      <dl className={styles.details} aria-live='polite'>
        <div><dt>{copy.stock} ({copy.catalogUi.boxes})</dt><dd>{product.inventory.stockQuantity}</dd></div>
        <div><dt>{copy.reserved} ({copy.catalogUi.boxes})</dt><dd>{product.inventory.reservedQuantity}</dd></div>
        <div><dt>{copy.available} ({copy.catalogUi.boxes})</dt><dd>{product.availableQuantity}</dd></div>
      </dl>
      <fieldset className={`${styles.fieldset} ${styles.form}`} disabled={busy}>
        <label className={styles.field}>{copy.catalogUi.adjustmentMode}<select disabled={form.locked} value={mode}
          onChange={event => setMode(event.target.value as 'delta' | 'set')}>
          <option value='delta'>{copy.catalogUi.delta}</option><option value='set'>{copy.catalogUi.set}</option>
        </select></label>
        <label className={styles.field}>{mode === 'delta' ? copy.catalogUi.deltaQuantity : copy.catalogUi.targetQuantity}
          <input disabled={form.locked} type='number' step='1' min={mode === 'set' ? 0 : undefined} required value={quantity}
            onChange={event => setQuantity(event.target.value)}/></label>
        <label className={styles.field}>{copy.reason}
          <textarea disabled={form.locked} name='reason' required maxLength={500}/></label>
        <ProductFormStatus form={form} currentVersion={version} copy={copy} busy={busy}/>
        <button className={styles.button}
          disabled={form.locked || form.version !== version}>{copy.catalogUi.adjustInventory}</button>
      </fieldset>
    </form>
  );
};
