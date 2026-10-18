import '@/shared/styles/globals.css';

import { CartRuntime } from '@/features/shopping-cart';
import { getDictionary } from '@/shared/lib/i18n/index.server';
import { Analytics } from '@/_app/analytics';
import { manrope } from '@/shared/styles/fonts';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  metadataBase: new URL('https://luvlae.com'),
};

interface Props {
  children: ReactNode;
}

export default async function DefaultRootLayout(props: Readonly<Props>) {
  const { children } = props;
  const dictionary = await getDictionary('en');

  return (
    <html lang='en' className={manrope.variable}>
      <body>{children}<CartRuntime copy={dictionary.commerce}/><Analytics/></body>
    </html>
  );
}
