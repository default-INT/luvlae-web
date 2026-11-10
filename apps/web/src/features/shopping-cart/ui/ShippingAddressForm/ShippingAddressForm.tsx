'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useCart } from '../../model/useCart';

import styles from './styles.module.scss';

import type { ShippingAddress } from '@/entities/order';
import type { Dictionary } from '@/shared/config/i18n';
import type { FormEvent } from 'react';

interface Props { copy: Dictionary['commerce'] }

const states = ['AL', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH',
  'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];

export const ShippingAddressForm = (props: Props) => {
  const { copy } = props;
  const { ready, items, pending, busy, error, checkout, cancelCheckout } = useCart();
  const router = useRouter();

  const proceed = async (address?: ShippingAddress) => {
    const id = await checkout(copy, address);

    if (id) router.push(`/orders/${id}/checkout`);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const text = (name: string) => String(fields.get(name) ?? '').trim();
    const line2 = text('line2');
    await proceed({ recipientName: text('recipientName'), line1: text('line1'), ...(line2 ? { line2 } : {}),
      city: text('city'), state: text('state'), postalCode: text('postalCode'), country: 'US' });
  };

  if (!ready) return <p role='status'>{copy.loadingAddress}</p>;

  if (!items.length && !pending) { return <p>
    {copy.emptyTitle} <Link href='/products/berberine-patches'>{copy.exploreProduct}</Link>
  </p>; }

  return (
    <div className={styles.card}>
      {pending ? <div className={styles.form}>
        <p>{copy.pendingCheckout}</p>
        <button className={styles.button} disabled={busy} onClick={() => void proceed()}>{copy.resumeCheckout}</button>
        <button className={styles.secondary} disabled={busy}
          onClick={() => void cancelCheckout(copy)}>{copy.cancelCheckout}</button>
      </div> : (
        <form className={styles.form} onSubmit={submit}>
          <p>{copy.shippingAddressNote}</p>
          <fieldset disabled={busy} className={styles.fields}>
            <label>{copy.recipientName}<input name='recipientName' autoComplete='shipping name' maxLength={100} required/></label>
            <label>{copy.addressLineOne}
              <input name='line1' autoComplete='shipping address-line1' maxLength={200} required/></label>
            <label>{copy.addressLineTwo}<input name='line2' autoComplete='shipping address-line2' maxLength={200}/></label>
            <label>{copy.addressCity}<input name='city' autoComplete='shipping address-level2' maxLength={100} required/></label>
            <label>{copy.addressState}<select name='state' autoComplete='shipping address-level1' required defaultValue=''>
              <option value='' disabled>{copy.chooseState}</option>
              {states.map(state => <option key={state} value={state}>{state}</option>)}
            </select></label>
            <label>{copy.addressZip}<input name='postalCode' autoComplete='shipping postal-code' inputMode='numeric'
              pattern='[0-9]{5}(-[0-9]{4})?' maxLength={10} required/></label>
            <p>{copy.countryUnitedStates}</p>
            <button className={styles.button}>{busy ? copy.creatingOrder : copy.continuePayment}</button>
          </fieldset>
        </form>
      )}
      {error && <p role='alert' className={styles.error}>{error}</p>}
      <p><Link href='/shipping'>{copy.shippingLink}</Link> · <Link href='/returns'>{copy.guaranteeLink}</Link></p>
    </div>
  );
};
