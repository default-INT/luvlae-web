import { ProductsPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

export const dynamic = 'force-dynamic';

export default async function ProductsRoute() {
  const dictionary = await getDictionary(defaultLocale);
  return <ProductsPage copy={dictionary.admin}/>;
}
