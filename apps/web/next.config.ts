import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
