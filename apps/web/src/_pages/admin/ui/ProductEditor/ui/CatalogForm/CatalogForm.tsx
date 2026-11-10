import { useState } from 'react';

import { priceInCents } from '../../../../model/types';
import styles from '../../../styles.module.scss';
import { useProductForm } from '../../utils/useProductForm';
import { ProductFormStatus } from '../ProductFormStatus';

import type { AdminCopy, AdminProduct } from '../../../../model/types';
import type { FormEvent } from 'react';

interface Props {
  product: AdminProduct; copy: AdminCopy; busy: boolean;
  reload: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}

export const CatalogForm = (props: Props) => {
  const { product, copy, busy, reload, onBusyChange } = props;
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.shortDescription);
  const [price, setPrice] = useState((product.price.unitAmount / 100).toFixed(2));
  const [salesEnabled, setSalesEnabled] = useState(product.salesEnabled);
  const form = useProductForm(copy, product.version, reload, onBusyChange);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const unitAmount = priceInCents(price);

    if (unitAmount === null || unitAmount > 99999999) { form.setValidation(copy.invalidPrice); return; }

    await form.run(`/products/${product.sku}`, {
      version: form.version, name, shortDescription: description, unitAmount, salesEnabled, reason: fields.get('reason'),
    }, 'PATCH');
  };

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <h2>{copy.pricing}</h2>
      <p className={styles.note}>{copy.catalogUi.standardNote}</p>
      <dl className={styles.details}>
        <div><dt>{copy.catalogUi.savedName}</dt><dd>{product.name}</dd></div>
        <div><dt>{copy.catalogUi.savedPrice}</dt><dd>{(product.price.unitAmount / 100).toFixed(2)} USD</dd></div>
        <div><dt>{copy.catalogUi.savedSales}</dt><dd>{product.salesEnabled ? copy.enabled : copy.disabled}</dd></div>
      </dl>
      <p className={styles.note}>{copy.catalogUi.savedDescription}: {product.shortDescription}</p>
      <fieldset className={`${styles.fieldset} ${styles.form}`} disabled={busy}>
        <label className={styles.field}>{copy.name}<input disabled={form.locked} required maxLength={200} value={name}
          onChange={event => setName(event.target.value)}/></label>
        <label className={styles.field}>{copy.description}<textarea disabled={form.locked} maxLength={2000} value={description}
          onChange={event => setDescription(event.target.value)}/></label>
        <label className={styles.field}>{copy.price}
          <input disabled={form.locked} type='number' min='0.01' max='999999.99' step='0.01'
            required value={price} onChange={event => setPrice(event.target.value)}/></label>
        <label className={styles.check}><input disabled={form.locked} type='checkbox' checked={salesEnabled}
          onChange={event => setSalesEnabled(event.target.checked)}/>{copy.salesEnabled}</label>
        <label className={styles.field}>{copy.reason}
          <textarea disabled={form.locked} name='reason' required maxLength={500}/></label>
        <ProductFormStatus form={form} currentVersion={product.version} copy={copy} busy={busy}/>
        <button className={styles.button}
          disabled={form.locked || form.version !== product.version}>{busy ? copy.saving : copy.save}</button>
      </fieldset>
    </form>
  );
};
