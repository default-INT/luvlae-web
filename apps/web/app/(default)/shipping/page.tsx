import { ShippingPage } from '@/_pages/shipping';
import { defaultLocale } from '@/shared/config/i18n';
import { defaultOgImage } from '@/shared/config/site';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { shippingPage } = await getDictionary(defaultLocale);

  return {
    title: `${shippingPage.title} | Luvlae`,
    description: shippingPage.description,
    alternates: { canonical: '/shipping' },
    openGraph: {
      title: `${shippingPage.title} | Luvlae`,
      description: shippingPage.description,
      url: '/shipping',
      siteName: 'Luvlae',
      type: 'website',
      images: [defaultOgImage],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default function ShippingRoute() {
  return <ShippingPage/>;
}
