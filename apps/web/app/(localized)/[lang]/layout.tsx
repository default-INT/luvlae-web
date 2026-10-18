import { notFound } from 'next/navigation';

import { CartRuntime } from '@/features/shopping-cart';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { Analytics } from '@/_app/analytics';
import { defaultLocale, isLocale, locales } from '@/shared/config/i18n';
import { manrope } from '@/shared/styles/fonts';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://luvlae.com'),
};

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.filter(lang => lang !== defaultLocale).map(lang => ({ lang }));
}

interface Props {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function LocalizedRootLayout(props: Readonly<Props>) {
  const { children, params } = props;
  const { lang } = await params;

  if (!isLocale(lang) || lang === defaultLocale) {
    notFound();
  }

  const dictionary = await getDictionary(lang);

  return (
    <html lang={lang} className={manrope.variable}>
      <body>{children}<CartRuntime copy={dictionary.commerce}/><Analytics/></body>
    </html>
  );
}
