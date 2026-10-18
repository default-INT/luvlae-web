import { adminOrders } from '@/_app/admin/queries.server';
import { OrdersPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

interface Props { searchParams: Promise<Record<string, string | string[] | undefined>> }
export const dynamic = 'force-dynamic';

export default async function OrdersRoute(props: Props) {
  const params = await props.searchParams;
  const filters: Record<string, string> = {};
  for (const key of ['q', 'orderStatus', 'paymentStatus', 'fulfillmentStatus', 'from', 'to', 'cursor']) {
    if (typeof params[key] === 'string' && params[key]) filters[key] = params[key];
  }

  const [data, dictionary] = await Promise.all([
    adminOrders(new URLSearchParams(filters).toString()), getDictionary(defaultLocale),
  ]);

  return <OrdersPage data={data} filters={filters} copy={dictionary.admin}/>;
}
