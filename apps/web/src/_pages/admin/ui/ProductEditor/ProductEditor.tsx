'use client';

import Link from 'next/link';
import { useState } from 'react';

import { adminRequest } from '../../api/admin';
import { priceInCents } from '../../model/types';
import { useAdminMutation } from '../../model/useAdminMutation';
import styles from '../styles.module.scss';

import type { AdminCopy, AdminProduct } from '../../model/types';
import type { FormEvent } from 'react';

interface Props { initialProduct: AdminProduct; copy: AdminCopy }
export const ProductEditor = (props: Props) => {
  const { initialProduct, copy } = props;
  const [product, setProduct] = useState(initialProduct);
  const [validation, setValidation] = useState('');
  const reload = async () => setProduct(await adminRequest<AdminProduct>(`/products/${product.sku}`));
  const mutation = useAdminMutation(copy, reload);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const unitAmount = priceInCents(String(fields.get('price')));
    setValidation('');
    if (unitAmount === null) { setValidation(copy.invalidPrice); return; }
    await mutation.run(`/products/${product.sku}`, {
      version: product.version, name: String(fields.get('name')), shortDescription: String(fields.get('description')),
      unitAmount, stockQuantity: Number(fields.get('stock')), salesEnabled: fields.get('salesEnabled') === 'on',
      reason: String(fields.get('reason')),
    }, 'PATCH');
  };

  return (
    <>
      <div className={styles.pageHeader}><Link href='/admin/products'>← {copy.backProducts}</Link>
        <h1>{product.name}</h1><p>{product.sku}</p></div>
      <form className={styles.columns} onSubmit={submit} key={product.version}>
        <section className={`${styles.card} ${styles.form}`}>
          <h2>{copy.pricing}</h2>
          <label className={styles.field}>{copy.name}<input name='name' required maxLength={200}
            defaultValue={product.name} disabled={mutation.busy}/></label>
          <label className={styles.field}>{copy.description}<textarea name='description' maxLength={2000}
            defaultValue={product.shortDescription} disabled={mutation.busy}/></label>
          <label className={styles.field}>{copy.price}<input name='price' type='number' min='0.01' step='0.01'
            required defaultValue={(product.price.unitAmount / 100).toFixed(2)} disabled={mutation.busy}/></label>
          <label className={styles.field}>{copy.reason}<textarea name='reason' required maxLength={500}
            disabled={mutation.busy}/></label>
          {(mutation.error || validation) && <p role='alert' className={styles.error}>{validation || mutation.error}</p>}
          {mutation.saved && <p role='status' className={styles.success}>{copy.saved}</p>}
          <button className={styles.button} disabled={mutation.busy}>{mutation.busy ? copy.saving : copy.save}</button>
        </section>
        <section className={`${styles.card} ${styles.form}`}>
          <h2>{copy.inventory}</h2>
          <label className={styles.field}>{copy.stock}<input name='stock' type='number' step='1'
            min={product.inventory.reservedQuantity} required defaultValue={product.inventory.stockQuantity}
            disabled={mutation.busy}/></label>
          <dl className={styles.details}>
            <div><dt>{copy.reserved}</dt><dd>{product.inventory.reservedQuantity}</dd></div>
            <div><dt>{copy.available}</dt><dd>{product.availableQuantity}</dd></div>
          </dl>
          <label className={styles.check}><input name='salesEnabled' type='checkbox' defaultChecked={product.salesEnabled}
            disabled={mutation.busy}/>{copy.salesEnabled}</label>
        </section>
      </form>
    </>
  );
};
