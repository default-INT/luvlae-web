import '@/shared/styles/globals.css';

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
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
