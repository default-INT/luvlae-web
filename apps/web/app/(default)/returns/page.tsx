import { ReturnsPage } from '@/_pages/returns';
import { defaultLocale } from '@/shared/config/i18n';
import { defaultOgImage } from '@/shared/config/site';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { returnsPage } = await getDictionary(defaultLocale);

  return {
    title: `${returnsPage.title} | Luvlae`,
    description: returnsPage.description,
    alternates: { canonical: '/returns' },
    openGraph: {
      title: `${returnsPage.title} | Luvlae`,
      description: returnsPage.description,
      url: '/returns',
      siteName: 'Luvlae',
      type: 'website',
      images: [defaultOgImage],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default function ReturnsRoute() {
  return <ReturnsPage/>;
}
