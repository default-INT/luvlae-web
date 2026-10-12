import { indexableInformationPaths } from '@/_pages/information';

import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/about-product', '/products/berberine-patches', '/ingredients', ...indexableInformationPaths].map(path => ({
    url: `https://luvlae.com${path}`,
  }));
}
