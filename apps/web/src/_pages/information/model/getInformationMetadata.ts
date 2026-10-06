import type { Metadata } from 'next';
import type { InformationPageContent } from './pages';

export const getInformationMetadata = (content: InformationPageContent): Metadata => ({
  title: `${content.title} | Luvlae`,
  description: content.description,
  alternates: { canonical: content.path },
  robots: content.noindex ? { index: false, follow: true } : undefined,
  openGraph: {
    title: `${content.title} | Luvlae`,
    description: content.description,
    url: content.path,
    siteName: 'Luvlae',
    type: 'website',
    images: [{
      url: '/images/luvlae-berberine-patches-woman-holding-box.jpg',
      width: 512,
      height: 279,
      alt: 'Illustrative image of a woman holding Luvlae Berberine Patches',
    }],
  },
  twitter: { card: 'summary_large_image' },
});
