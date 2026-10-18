import styles from '../styles.module.scss';

import type { AdminCopy } from '../../model/types';

interface Props { loading: boolean; error: string; copy: AdminCopy; onRetry: () => void }
export const DataStatus = (props: Props) => {
  const { loading, error, copy, onRetry } = props;
  if (error) { return <div className={styles.error} role='alert'>
    <p>{error}</p><button className={styles.secondary} onClick={onRetry}>{copy.retry}</button>
  </div>; }
  if (loading) return <p className={styles.loading} role='status'>{copy.loading}</p>;
  return null;
};
