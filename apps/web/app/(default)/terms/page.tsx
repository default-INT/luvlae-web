import { TermsPage } from '@/_pages/terms';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { termsPage } = await getDictionary(defaultLocale);

  return {
    title: `${termsPage.title} | Luvlae`,
    description: termsPage.description,
    alternates: { canonical: '/terms' },
    openGraph: {
      title: `${termsPage.title} | Luvlae`,
      description: termsPage.description,
      url: '/terms',
      siteName: 'Luvlae',
      type: 'website',
    },
  };
};

export default function TermsRoute() {
  return <TermsPage/>;
}
