import { notFound } from 'next/navigation';

import { ProductPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

interface Props { params: Promise<{ sku: string }> }
export const dynamic = 'force-dynamic';

export default async function ProductRoute(props: Props) {
  const { sku } = await props.params;

  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(sku)) notFound();

  const dictionary = await getDictionary(defaultLocale);
  return <ProductPage sku={sku} copy={dictionary.admin}/>;
}
