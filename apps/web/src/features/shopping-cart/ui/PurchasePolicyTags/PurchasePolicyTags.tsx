import Link from 'next/link';

import styles from './styles.module.scss';

import type { Dictionary } from '@/shared/config/i18n';

interface Props { copy: Dictionary['commerce']; onNavigate?: () => void; compact?: boolean }

export const PurchasePolicyTags = (props: Props) => {
  const { copy, onNavigate, compact } = props;

  return (
    <div className={`${styles.policies} ${compact ? styles.compact : ''}`}>
      <Link onClick={onNavigate} href='/shipping' className={styles.policy} title={copy.shippingLine}>
        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' aria-hidden='true'>
          <path d='M3 5h11v12H3zM14 9h4l3 4v4h-7'/><path d='M3 10H1m2 4H1'/>
          <circle cx='7' cy='18' r='2'/><circle cx='18' cy='18' r='2'/>
        </svg>
        {copy.shippingTag}
      </Link>
      <Link onClick={onNavigate} href='/returns' className={styles.policy}
        title={`${copy.guaranteeLine} ${copy.guaranteeDetail}`}>
        <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' aria-hidden='true'>
          <path d='M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6z'/><path d='m8 12 3 3 5-6'/>
        </svg>
        {copy.guaranteeTag}
      </Link>
    </div>
  );
};
