import { Skeleton } from '@/shared/ui/Skeleton';
import { Spinner } from '@/shared/ui/Spinner';

import styles from '../styles.module.scss';

import type { AdminCopy } from '../../model/types';

interface Props { loading: boolean; error: string; copy: AdminCopy; onRetry: () => void; skeleton?: boolean }

export const DataStatus = (props: Props) => {
  const { loading, error, copy, onRetry, skeleton = false } = props;

  if (error) { return <div className={styles.error} role='alert'>
    <p>{error}</p><button className={styles.secondary} onClick={onRetry}>{copy.retry}</button>
  </div>; }

  if (loading) return skeleton ? <Skeleton label={copy.loading}/> : <Spinner label={copy.loading}/>;

  return null;
};
