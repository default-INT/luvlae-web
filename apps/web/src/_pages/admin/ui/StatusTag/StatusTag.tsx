import styles from './styles.module.scss';

import type { AdminCopy } from '../../model/types';

interface Props { status: string; copy: AdminCopy }

export const StatusTag = (props: Props) => {
  const { status, copy } = props;
  let tone = styles.neutral;

  if (['paid', 'completed', 'delivered', 'enabled', 'succeeded'].includes(status)) tone = styles.success;

  if (['pending', 'processing', 'partially_refunded', 'shipped', 'requested', 'unknown'].includes(status)) tone = styles.warning;

  if (['cancelled', 'failed', 'expired', 'refunded', 'disabled'].includes(status)) tone = styles.negative;

  const labels: Record<string, string> = { ...copy.statuses, enabled: copy.enabled, disabled: copy.disabled };
  return <span className={`${styles.tag} ${tone}`}>{labels[status] ?? status}</span>;
};
