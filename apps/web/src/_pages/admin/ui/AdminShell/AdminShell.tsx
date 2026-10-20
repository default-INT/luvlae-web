'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { adminRequest, AdminApiError } from '../../api/admin';
import styles from '../styles.module.scss';

import type { AdminCopy } from '../../model/types';
import type { ReactNode } from 'react';

interface Props { email: string; copy: AdminCopy; children: ReactNode }

export const AdminShell = (props: Props) => {
  const { email, copy, children } = props;
  const path = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    if (busy) return;

    setBusy(true);

    try {
      await adminRequest('/auth/logout', {});
      router.replace('/admin/login');
    } catch (failure) {
      if (failure instanceof AdminApiError && failure.status === 401) {
        router.replace('/admin/login');
      }

      setError(copy.requestError);
      setBusy(false);
    }
  };

  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <Link className={styles.brand} href='/admin/orders'>LUVLAE<small>{copy.title}</small></Link>
        <nav aria-label={copy.label}>
          <Link href='/admin/orders' className={path.startsWith('/admin/orders') ? styles.active : undefined}
            aria-current={path.startsWith('/admin/orders') ? 'page' : undefined}>{copy.orders}</Link>
          <Link href='/admin/products' className={path.startsWith('/admin/products') ? styles.active : undefined}
            aria-current={path.startsWith('/admin/products') ? 'page' : undefined}>{copy.products}</Link>
        </nav>
        <div className={styles.account}><span>{email}</span>
          <button className={styles.secondary} disabled={busy} onClick={signOut}>{copy.signOut}</button>
        </div>
      </header>
      <main className={styles.main}>{error && <p className={styles.error} role='alert'>{error}</p>}{children}</main>
    </div>
  );
};
