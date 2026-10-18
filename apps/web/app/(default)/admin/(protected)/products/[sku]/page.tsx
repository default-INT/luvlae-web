import { notFound } from 'next/navigation';

import { adminProduct } from '@/_app/admin/queries.server';
import { ProductEditor } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

interface Props { params: Promise<{ sku: string }> }
export const dynamic = 'force-dynamic';

export default async function ProductRoute(props: Props) {
  const { sku } = await props.params;
  if (!/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(sku)) notFound();
  const [product, dictionary] = await Promise.all([adminProduct(sku), getDictionary(defaultLocale)]);
  return <ProductEditor initialProduct={product} copy={dictionary.admin}/>;
}
