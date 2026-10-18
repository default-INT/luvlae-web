import { notFound } from 'next/navigation';

import { adminOrder } from '@/_app/admin/queries.server';
import { OrderDetailPage } from '@/_pages/admin';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

interface Props { params: Promise<{ id: string }> }
export const dynamic = 'force-dynamic';

export default async function OrderRoute(props: Props) {
  const { id } = await props.params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const [order, dictionary] = await Promise.all([adminOrder(id), getDictionary(defaultLocale)]);
  return <OrderDetailPage initialOrder={order} copy={dictionary.admin}/>;
}
