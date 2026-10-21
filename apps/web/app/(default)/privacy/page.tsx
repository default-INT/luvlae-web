import { PrivacyPage } from '@/_pages/privacy';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { privacyPage } = await getDictionary(defaultLocale);

  return {
    title: `${privacyPage.title} | Luvlae`,
    description: privacyPage.description,
    alternates: { canonical: '/privacy' },
    openGraph: {
      title: `${privacyPage.title} | Luvlae`,
      description: privacyPage.description,
      url: '/privacy',
      siteName: 'Luvlae',
      type: 'website',
    },
  };
};

export default function PrivacyRoute() {
  return <PrivacyPage/>;
}
