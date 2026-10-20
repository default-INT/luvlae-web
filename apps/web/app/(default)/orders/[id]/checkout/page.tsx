import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { getGuestCheckout } from '@/_app/commerce/checkout-session.server';
import { CheckoutPage } from '@/_pages/checkout';
import { guestOrderCookieName } from '@/entities/order/index.server';
import { ApiError } from '@/shared/lib/api/index.server';

import type { Metadata } from 'next';
import type { GuestCheckout } from '@/entities/order';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Checkout | Luvlae', robots: { index: false, follow: false } };

interface Props { params: Promise<{ id: string }> }

export default async function CheckoutRoute(props: Props) {
  const { id } = await props.params;

  if (!/^[a-f0-9]{24}$/.test(id)) notFound();

  const token = (await cookies()).get(guestOrderCookieName)?.value;
  let checkout: GuestCheckout | null | undefined;

  try {
    checkout = await getGuestCheckout(id, token);
  } catch (error) {
    const unavailable = error instanceof ApiError && ['CHECKOUT_UNAVAILABLE', 'STRIPE_NOT_CONFIGURED'].includes(error.code);

    if (!unavailable) throw error;
  }

  if (checkout === null) notFound();

  return <CheckoutPage id={id} checkout={checkout}/>;
}
