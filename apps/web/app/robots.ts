import { siteUrl } from '@/shared/config/site';
import { isStage } from '@/shared/config/environment';

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  if (isStage) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: siteUrl('/sitemap.xml'),
  };
}
