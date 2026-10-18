import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { OrderPage } from '@/_pages/order';
import { getGuestOrder, guestOrderCookieName } from '@/entities/order/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your order | Luvlae', robots: { index: false, follow: false } };

interface Props { params: Promise<{ id: string }> }
export default async function OrderRoute(props: Props) {
  const { id } = await props.params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const token = (await cookies()).get(guestOrderCookieName)?.value;
  const order = await getGuestOrder(id, token);
  if (!order) notFound();
  return <OrderPage order={order}/>;
}
