import Link from 'next/link';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  href: string;
  children: ReactNode;
  variant?: 'dark' | 'light' | 'outline' | 'text';
  external?: boolean;
  className?: string;
}

export const ActionLink = (props: Props) => {
  const { href, children, variant = 'dark', external = false, className = '' } = props;
  const classes = `${styles.link} ${styles[variant]} ${className}`;

  if (external) {
    return (
      <a className={classes} href={href} target='_blank' rel='noopener noreferrer sponsored'>
        <span>{children}</span>
        <span className={styles.arrow} aria-hidden='true'>↗</span>
      </a>
    );
  }

  return (
    <Link className={classes} href={href}>
      <span>{children}</span>
      <span className={styles.arrow} aria-hidden='true'>↗</span>
    </Link>
  );
};
