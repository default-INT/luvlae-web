import { notFound } from 'next/navigation';

import { LegacyOrderAccess } from '@/_pages/order';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };
interface Props { params: Promise<{ id: string }> }

export default async function LegacyOrderRoute(props: Props) {
  const { id } = await props.params;

  if (!/^[a-f0-9]{24}$/.test(id)) notFound();

  const dictionary = await getDictionary(defaultLocale);
  return <LegacyOrderAccess id={id} label={dictionary.commerce.openingOrder}/>;
}
