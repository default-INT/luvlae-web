import { AboutPage } from '@/_pages/about';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { aboutPageMetadata: copy } = await getDictionary(defaultLocale);

  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: '/about' },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: '/about',
      siteName: 'Luvlae',
      type: 'website',
      images: [{
        url: '/images/luvlae-berberine-patches-woman-holding-box.jpg',
        width: 512,
        height: 279,
        alt: 'Illustrative image of a woman holding Luvlae Berberine Patches',
      }],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default async function AboutRoute() {
  const dictionary = await getDictionary(defaultLocale);

  return <AboutPage dictionary={dictionary} content={dictionary.aboutPage}/>;
}
