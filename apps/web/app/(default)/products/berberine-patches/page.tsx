import { ProductPage } from '@/_pages/product';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const dictionary = await getDictionary(defaultLocale);
  const { metadata, hero } = dictionary.productPage;

  return {
    title: metadata.title,
    description: metadata.description,
    alternates: { canonical: '/products/berberine-patches' },
    openGraph: {
      title: metadata.ogTitle,
      description: metadata.ogDescription,
      url: '/products/berberine-patches',
      siteName: metadata.siteName,
      type: 'website',
      images: [{
        url: '/images/luvlae-berberine-patches-box-and-patch-sheet.png',
        width: 2500,
        height: 2500,
        alt: hero.imageOneAlt,
      }],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default function ProductRoute() {
  return <ProductPage/>;
}
