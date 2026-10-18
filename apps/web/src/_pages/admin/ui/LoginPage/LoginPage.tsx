'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { adminRequest, AdminApiError } from '../../api/admin';
import styles from '../styles.module.scss';

import type { AdminCopy } from '../../model/types';
import type { FormEvent } from 'react';

interface Props { copy: AdminCopy }
export const LoginPage = (props: Props) => {
  const { copy } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await adminRequest('/auth/login', { email: fields.get('email'), password: fields.get('password') });
      router.replace('/admin/orders');
    } catch (failure) {
      let message = copy.requestError;
      if (failure instanceof AdminApiError && failure.status === 401) message = copy.loginError;
      if (failure instanceof AdminApiError && failure.status === 429) message = copy.loginLimited;
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className={styles.login}>
      <section className={`${styles.card} ${styles.loginCard}`}>
        <span className={styles.brand}>LUVLAE<small>{copy.title}</small></span>
        <h1>{copy.welcome}</h1><p>{copy.loginDescription}</p>
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>{copy.email}<input name='email' type='email' autoComplete='username' required
            maxLength={254} disabled={busy}/></label>
          <label className={styles.field}>{copy.password}<input name='password' type='password'
            autoComplete='current-password' required maxLength={256} disabled={busy}/></label>
          {error && <p role='alert' className={styles.error}>{error}</p>}
          <button className={styles.button} disabled={busy}>{busy ? copy.signingIn : copy.signIn}</button>
        </form>
      </section>
    </main>
  );
};
