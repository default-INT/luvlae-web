import { ContactPage } from '@/_pages/contact';
import { defaultLocale } from '@/shared/config/i18n';
import { defaultOgImage } from '@/shared/config/site';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export const generateMetadata = async (): Promise<Metadata> => {
  const { contactPage } = await getDictionary(defaultLocale);

  return {
    title: `${contactPage.metaTitle} | Luvlae`,
    description: contactPage.description,
    alternates: { canonical: '/contact' },
    openGraph: {
      title: `${contactPage.metaTitle} | Luvlae`,
      description: contactPage.description,
      url: '/contact',
      siteName: 'Luvlae',
      type: 'website',
      images: [defaultOgImage],
    },
    twitter: { card: 'summary_large_image' },
  };
};

export default function ContactRoute() {
  return <ContactPage/>;
}
