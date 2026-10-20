'use client';

import { useAdminResource } from '../../model/useAdminResource';
import { AdminShell } from '../AdminShell';
import { DataStatus } from '../DataStatus';
import styles from '../styles.module.scss';

import type { AdminCopy } from '../../model/types';
import type { ReactNode } from 'react';

interface Props { children: ReactNode; copy: AdminCopy }

export const AdminSession = (props: Props) => {
  const { children, copy } = props;
  const session = useAdminResource<{ email: string }>('/auth/me', copy);

  if (!session.data) { return <main className={styles.main}>
    <DataStatus loading={session.loading} error={session.error} copy={copy} onRetry={() => { void session.reload(); }}/>
  </main>; }

  return <AdminShell email={session.data.email} copy={copy}>{children}</AdminShell>;
};
