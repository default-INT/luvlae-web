import { AdminShell } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import { adminSession } from '../queries.server';

import type { ReactNode } from 'react';

interface Props { children: ReactNode }
export const AdminGuard = async (props: Props) => {
  const { children } = props;
  const [user, dictionary] = await Promise.all([adminSession(), getDictionary(defaultLocale)]);
  return <AdminShell email={user.email} copy={dictionary.admin}>{children}</AdminShell>;
};
