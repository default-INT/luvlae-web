import { ProductFilmPage } from '@/_pages/product-film';
import { defaultLocale } from '@/shared/config/i18n';
import { getDictionary } from '@/shared/lib/i18n/index.server';

import type { Metadata } from 'next';

export const dynamic = 'force-static';

export async function generateMetadata(): Promise<Metadata> {
  const { home } = await getDictionary(defaultLocale);

  return {
    title: home.video.label,
    description: home.video.description,
    alternates: { canonical: '/videos/berberine-patches' },
    openGraph: {
      title: home.video.label,
      description: home.video.description,
      url: '/videos/berberine-patches',
      type: 'website',
      images: [{ url: '/video/product-video-poster.webp', width: 1280, height: 720, alt: home.video.label }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function ProductFilmRoute() {
  const dictionary = await getDictionary(defaultLocale);

  return <ProductFilmPage dictionary={dictionary}/>;
}
