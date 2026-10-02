import { notFound } from 'next/navigation';

import { defaultLocale, isLocale, locales } from '@/shared/config/i18n';

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

  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
