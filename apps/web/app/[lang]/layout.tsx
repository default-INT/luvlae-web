import '@/shared/styles/globals.css';

import { notFound } from 'next/navigation';

import { isLocale, locales } from '@/shared/config/i18n';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL('https://luvlae.com'),
};

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.map(lang => ({ lang }));
}

export default async function RootLayout(props: Readonly<LayoutProps<'/[lang]'>>) {
  const { children, params } = props;
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
