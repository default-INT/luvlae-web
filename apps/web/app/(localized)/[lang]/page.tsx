import { notFound } from 'next/navigation';

import { HomePage } from '@/_pages/home';
import { defaultLocale, isLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

type HomeRouteProps = PageProps<'/[lang]'>;

export const dynamic = 'force-static';

async function getLocalizedDictionary(params: HomeRouteProps['params']) {
  const { lang } = await params;

  if (!isLocale(lang) || lang === defaultLocale) {
    notFound();
  }

  return getDictionary(lang);
}

export async function generateMetadata({ params }: HomeRouteProps): Promise<Metadata> {
  const { lang } = await params;
  const dictionary = await getLocalizedDictionary(params);

  return {
    title: dictionary.metadata.title,
    description: dictionary.metadata.description,
    alternates: {
      canonical: `/${lang}`,
    },
    openGraph: {
      title: dictionary.metadata.title,
      description: dictionary.metadata.description,
      url: `/${lang}`,
      siteName: 'Luvlae',
      type: 'website',
      images: [{
        url: '/images/luvlae-berberine-patches-front-box-and-patch-sheet.webp',
        width: 2500,
        height: 2500,
        alt: 'Luvlae Berberine Patches box and pearly patch sheet',
      }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function HomeRoute(props: HomeRouteProps) {
  const { params } = props;
  const dictionary = await getLocalizedDictionary(params);

  return <HomePage dictionary={dictionary}/>;
}
