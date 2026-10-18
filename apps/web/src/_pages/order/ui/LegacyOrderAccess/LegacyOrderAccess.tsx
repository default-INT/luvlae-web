'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import styles from '../OrderResult/styles.module.scss';

interface Props { id: string; label: string }
export const LegacyOrderAccess = (props: Props) => {
  const { id, label } = props;
  const router = useRouter();
  useEffect(() => {
    let active = true;

    const restore = async () => {
      try {
        const token = sessionStorage.getItem(`luvlae-order-${id}`);
        if (token) {
          const response = await fetch(`/api/orders/${id}/access`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: '{}', signal: AbortSignal.timeout(30000),
          });

          if (response.ok) sessionStorage.removeItem(`luvlae-order-${id}`);
        }
      } finally {
        if (active) router.replace(`/orders/${id}`);
      }
    };

    void restore().catch(() => { /* The destination performs authoritative server authorization. */ });
    return () => { active = false; };
  }, [id, router]);
  return <main className={styles.main}><section className={styles.card}><h1>{label}</h1></section></main>;
};
