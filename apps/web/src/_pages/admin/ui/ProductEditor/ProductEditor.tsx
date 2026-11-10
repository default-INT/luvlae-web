'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { adminRequest } from '../../api/admin';
import styles from '../styles.module.scss';

import { CatalogForm } from './ui/CatalogForm';
import { InventoryForm } from './ui/InventoryForm';
import { OffersSection } from './ui/OffersSection';
import { StorefrontForm } from './ui/StorefrontForm';

import type { AdminCopy, AdminProduct } from '../../model/types';

interface Props { initialProduct: AdminProduct; copy: AdminCopy }

export const ProductEditor = (props: Props) => {
  const { initialProduct, copy } = props;
  const [product, setProduct] = useState(initialProduct);
  const [busy, setBusy] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const busyRef = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const onBusyChange = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
  }, []);

  const reload = useCallback(async () => {
    const id = ++requestId.current;

    try {
      const latest = await adminRequest<AdminProduct>(`/products/${initialProduct.sku}`);

      if (mounted.current && id === requestId.current) {
        setProduct(latest);
        setRefreshError(false);
        setRefreshedAt(new Date().toLocaleTimeString('en-US'));
      }
    } catch (failure) {
      if (mounted.current && id === requestId.current) setRefreshError(true);

      throw failure;
    }
  }, [initialProduct.sku]);

  useEffect(() => {
    mounted.current = true;

    const refresh = () => {
      if (!busyRef.current && document.visibilityState === 'visible') void reload().catch(() => {});
    };

    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      mounted.current = false;
      requestId.current += 1;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [reload]);

  const formProps = { product, copy, busy, reload, onBusyChange };

  return (
    <>
      <div className={styles.pageHeader}>
        <Link href='/admin/products'>← {copy.backProducts}</Link>
        <h1>{product.name}</h1><p>{copy.sku}: {product.sku}</p>
        <p>{copy.catalogUi.refreshNote}{refreshedAt && ` · ${copy.catalogUi.refreshedAt}: ${refreshedAt}`}</p>
        <button className={styles.secondary} disabled={busy} onClick={() => void reload().catch(() => {})}>{copy.refresh}</button>
        {refreshError && <p role='alert' className={styles.error}>{copy.catalogUi.refreshError}</p>}
      </div>
      <div className={styles.stack}>
        <div className={styles.columns}><CatalogForm {...formProps}/><InventoryForm {...formProps}/></div>
        <StorefrontForm {...formProps}/>
        <OffersSection {...formProps}/>
      </div>
    </>
  );
};
