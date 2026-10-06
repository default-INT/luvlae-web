import { indexableInformationPaths } from '@/_pages/information';

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/products/berberine-patches', ...indexableInformationPaths].map(path => ({
    url: `https://luvlae.com${path}`,
  }));
}
