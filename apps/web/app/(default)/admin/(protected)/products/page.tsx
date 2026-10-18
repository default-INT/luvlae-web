import { adminProducts } from '@/_app/admin/queries.server';
import { ProductsPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

interface Props { searchParams: Promise<{ cursor?: string }> }
export const dynamic = 'force-dynamic';

export default async function ProductsRoute(props: Props) {
  const { cursor } = await props.searchParams;

  const [data, dictionary] = await Promise.all([
    adminProducts(cursor ? new URLSearchParams({ cursor }).toString() : ''), getDictionary(defaultLocale),
  ]);

  return <ProductsPage cursor={cursor} data={data} copy={dictionary.admin}/>;
}
