import { LoginPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

export const dynamic = 'force-dynamic';

export default async function LoginRoute() {
  const dictionary = await getDictionary(defaultLocale);
  return <LoginPage copy={dictionary.admin}/>;
}
