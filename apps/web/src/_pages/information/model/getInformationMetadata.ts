import type { Metadata } from 'next';
import type { InformationPageContent } from './pages';

export const getInformationMetadata = (content: InformationPageContent): Metadata => ({
  title: `${content.title} | Luvlae`,
  description: content.description,
  alternates: { canonical: content.path },
  robots: content.noindex ? { index: false, follow: true } : undefined,
});
