import { ContactPage } from '@/_pages/contact';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { contactPage } = await getDictionary(defaultLocale);

  return {
    title: `${contactPage.title} | Luvlae`,
    description: contactPage.description,
    alternates: { canonical: '/contact' },
    openGraph: {
      title: `${contactPage.title} | Luvlae`,
      description: contactPage.description,
      url: '/contact',
      siteName: 'Luvlae',
      type: 'website',
    },
  };
};

export default function ContactRoute() {
  return <ContactPage/>;
}
