import { siteOrigin } from './src/shared/config/site';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  redirects: async () => [{
    source: '/:path*',
    has: [{ type: 'host', value: 'luvlae.com' }],
    destination: `${siteOrigin}/:path*`,
    permanent: true,
  }],
  headers: async () => ['/admin/:path*', '/orders/:path*', '/order/:path*'].map(source => ({
    source,
    headers: [
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'CDN-Cache-Control', value: 'no-store' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ],
  })),
};

export default nextConfig;
