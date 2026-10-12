import { AboutProductPage } from '@/_pages/about-product';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { aboutProductMetadata } = await getDictionary(defaultLocale);

  return {
    ...aboutProductMetadata,
    alternates: { canonical: '/about-product' },
    openGraph: {
      ...aboutProductMetadata,
      url: '/about-product',
      siteName: 'Luvlae',
      type: 'website',
      images: [{
        url: '/images/luvlae-berberine-woman-with-patches.webp',
        width: 1280,
        height: 853,
        alt: 'Woman holding a Luvlae Berberine Patches box',
      }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function AboutProductRoute() {
  const dictionary = await getDictionary(defaultLocale);

  return <AboutProductPage dictionary={dictionary}/>;
}
