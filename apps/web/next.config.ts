import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/*': ['./src/shared/config/i18n/messages/**/*.yaml'],
  },
};

export default nextConfig;
