'use client';

import { useId, useState } from 'react';

import styles from './styles.module.scss';

import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  showLabel: string;
  hideLabel: string;
}

export const MoreReviews = (props: Props) => {
  const { children, showLabel, hideLabel } = props;
  const [open, setOpen] = useState(false);
  const contentId = useId();

  return (
    <div className={styles.moreReviews}>
      <button
        type='button'
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen(current => !current)}
      >
        {open ? hideLabel : showLabel}
        <svg className={open ? styles.chevronOpen : styles.chevron} viewBox='0 0 20 20' fill='none' aria-hidden='true'>
          <path d='m4 7 6 6 6-6' stroke='currentColor' strokeWidth='1.8' strokeLinecap='round' strokeLinejoin='round'/>
        </svg>
      </button>
      <div className={`${styles.panel} ${open ? styles.open : ''}`} id={contentId} aria-hidden={!open} inert={!open}>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
};
