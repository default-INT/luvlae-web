import { defaultOgImage } from '@/shared/config/site';

import type { Metadata } from 'next';
import type { InformationPageContent } from './pages';

export const getInformationMetadata = (content: InformationPageContent): Metadata => ({
  title: `${content.metaTitle ?? content.title} | Luvlae`,
  description: content.description,
  alternates: { canonical: content.path },
  robots: content.noindex ? { index: false, follow: true } : undefined,
  openGraph: {
    title: `${content.metaTitle ?? content.title} | Luvlae`,
    description: content.description,
    url: content.path,
    siteName: 'Luvlae',
    type: 'website',
    images: [defaultOgImage],
  },
  twitter: { card: 'summary_large_image' },
});
