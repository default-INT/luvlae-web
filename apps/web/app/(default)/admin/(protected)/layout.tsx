import { AdminSession } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { ReactNode } from 'react';

interface Props { children: ReactNode }

export default async function ProtectedLayout(props: Props) {
  const dictionary = await getDictionary(defaultLocale);
  return <AdminSession copy={dictionary.admin}>{props.children}</AdminSession>;
}
