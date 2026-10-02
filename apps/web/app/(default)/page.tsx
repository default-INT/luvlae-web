import { HomePage } from '@/_pages/home';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const dictionary = await getDictionary(defaultLocale);

  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    alternates: {
      canonical: '/',
    },
  };
}

export default async function HomeRoute() {
  const dictionary = await getDictionary(defaultLocale);

  return <HomePage dictionary={dictionary}/>;
}
