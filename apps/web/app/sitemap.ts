import { indexableInformationPaths } from '@/_pages/information';
import { isStage } from '@/shared/config/environment';

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  if (isStage) return [];

  const paths = [
    '/', '/contact', '/shipping', '/returns', '/terms', '/privacy', '/about-product',
    '/products/berberine-patches', '/ingredients',
    ...indexableInformationPaths,
  ];

  return paths.map(path => ({
    url: `https://luvlae.com${path}`,
  }));
}
