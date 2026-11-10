import { useState } from 'react';

import styles from '../../../styles.module.scss';
import { useProductForm } from '../../utils/useProductForm';
import { ProductFormStatus } from '../ProductFormStatus';

import local from './styles.module.scss';

import type { AdminCopy, AdminProduct } from '../../../../model/types';
import type { FormEvent } from 'react';

interface Props {
  product: AdminProduct; copy: AdminCopy; busy: boolean;
  reload: () => Promise<void>; onBusyChange: (busy: boolean) => void;
}

export const StorefrontForm = (props: Props) => {
  const { product, copy, busy, reload, onBusyChange } = props;
  const ui = copy.catalogUi;

  const [slots, setSlots] = useState(() => Array.from(
    { length: 3 }, (_, index) => product.storefront?.homeOfferIds[index] ?? '',
  ));

  const [highlight, setHighlight] = useState(product.storefront?.highlightedOfferId ?? '');
  const [badge, setBadge] = useState(product.storefront?.highlightBadge ?? 'bestValue');
  const form = useProductForm(copy, product.version, reload, onBusyChange);

  const options = [{ id: 'standard', label: `${ui.standard} · 1 ${ui.boxes}` },
    ...(product.offers ?? []).filter(offer => offer.status === 'active')
      .map(offer => ({ id: offer.id, label: `${offer.unitsPerPack} ${ui.boxes} · ${offer.id}` }))];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const ids = slots.filter(Boolean);

    if (new Set(ids).size !== ids.length || ids.some(id => !options.some(option => option.id === id))
      || (highlight && !ids.includes(highlight))) { form.setValidation(ui.invalidStorefront); return; }

    await form.run(`/products/${product.sku}/storefront`, {
      version: form.version, homeOfferIds: ids, highlightedOfferId: highlight || null,
      highlightBadge: badge, reason: fields.get('reason'),
    }, 'PATCH');
  };

  return (
    <form className={`${styles.card} ${styles.form}`} onSubmit={submit}>
      <header className={local.header}>
        <h2>{ui.storefront}</h2>
        <p className={styles.note}>{ui.storefrontNote}</p>
        <div className={`${styles.note} ${local.saved}`}>
          <span>{ui.savedSlots}: {product.storefront?.homeOfferIds.join(', ') || ui.none}</span>
          <span>{ui.highlightOffer}: {product.storefront?.highlightedOfferId || ui.none}</span>
          <span>{ui.highlightBadge}: {product.storefront?.highlightBadge === 'recommended' ? ui.recommended : ui.bestValue}</span>
        </div>
      </header>
      <fieldset className={`${styles.fieldset} ${styles.form}`} disabled={busy}>
        {slots.map((id, index) => (
          <label className={styles.field} key={index}>{ui.homeSlot} {index + 1}
            <select disabled={form.locked} value={id} onChange={event => setSlots(current => current.map((value, position) =>
              position === index ? event.target.value : value))}>
              <option value=''>{ui.none}</option>
              {id && !options.some(option => option.id === id) && <option value={id}>{ui.unavailableOffer} · {id}</option>}
              {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        ))}
        <hr className={local.divider}/>
        <label className={styles.field}>{ui.highlightOffer}<select disabled={form.locked} value={highlight}
          onChange={event => setHighlight(event.target.value)}>
          <option value=''>{ui.none}</option>
          {highlight && !options.some(option => option.id === highlight)
            && <option value={highlight}>{ui.unavailableOffer} · {highlight}</option>}
          {options.filter(option => slots.includes(option.id) || option.id === highlight)
            .map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select></label>
        <label className={styles.field}>{ui.highlightBadge}<select disabled={form.locked} value={badge}
          onChange={event => setBadge(event.target.value as 'bestValue' | 'recommended')}>
          <option value='bestValue'>{ui.bestValue}</option><option value='recommended'>{ui.recommended}</option>
        </select></label>
        <label className={styles.field}>{copy.reason}
          <textarea disabled={form.locked} name='reason' required maxLength={500}/></label>
        <ProductFormStatus form={form} currentVersion={product.version} copy={copy} busy={busy}/>
        <button className={styles.button} disabled={form.locked || form.version !== product.version}>{copy.save}</button>
      </fieldset>
    </form>
  );
};
