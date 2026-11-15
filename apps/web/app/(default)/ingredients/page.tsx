import { IngredientsPage } from '@/_pages/ingredients';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { ingredientsPage: page } = await getDictionary(defaultLocale);

  return {
    title: `${page.title} | Luvlae`,
    description: page.description,
    alternates: { canonical: '/ingredients' },
    // TODO: Re-check the ingredient graphic against the current package label and promoted ASIN.
    robots: { index: true, follow: true },
    openGraph: {
      title: `${page.title} | Luvlae`,
      description: page.description,
      url: '/ingredients',
      siteName: 'Luvlae',
      type: 'website',
      images: [{
        url: '/images/luvlae-og-ingredients.webp',
        width: 1200,
        height: 630,
        alt: page.imageAlt,
      }],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default function IngredientsRoute() {
  return <IngredientsPage/>;
}
