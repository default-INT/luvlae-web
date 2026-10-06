import '@/shared/styles/globals.css';

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

export default function DefaultRootLayout(props: Readonly<Props>) {
  const { children } = props;

  return (
    <html lang='en' className={manrope.variable}>
      <body>{children}<Analytics/></body>
    </html>
  );
}
