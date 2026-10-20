'use client';

import Link from 'next/link';

import styles from '../styles.module.scss';

interface Props { reset: () => void; message: string; retry: string; orders: string }

export const AdminError = (props: Props) => {
  const { reset, message, retry, orders } = props;
  return <section className={styles.card}><h1>{message}</h1><div className={styles.row}>
    <button className={styles.button} onClick={reset}>{retry}</button>
    <Link className={styles.secondary} href='/admin/orders'>{orders}</Link>
  </div></section>;
};
