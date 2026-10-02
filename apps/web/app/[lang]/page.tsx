import { notFound } from 'next/navigation';

import { HomePage } from '@/_pages/home';
import { isLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

type HomeRouteProps = PageProps<'/[lang]'>;

async function getLocalizedDictionary(params: HomeRouteProps['params']) {
  const { lang } = await params;

  if (!isLocale(lang)) {
    notFound();
  }

  return getDictionary(lang);
}

export async function generateMetadata({ params }: HomeRouteProps): Promise<Metadata> {
  const dictionary = await getLocalizedDictionary(params);

  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    alternates: {
      canonical: '/',
    },
  };
}

export default async function HomeRoute(props: HomeRouteProps) {
  const { params } = props;
  const dictionary = await getLocalizedDictionary(params);

  return <HomePage dictionary={dictionary}/>;
}
