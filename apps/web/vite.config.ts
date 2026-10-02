import { createHash } from 'node:crypto';
import path from 'node:path';

import { cloudflare } from '@cloudflare/vite-plugin';
import { staticAssetsAdapter } from '@vinext/cloudflare/cache/static-assets-adapter';
import { defineConfig } from 'vite';
import vinext from 'vinext';
import { patchCssModules } from 'vite-css-modules';

export default defineConfig({
  plugins: [
    patchCssModules({ exportMode: 'default' }),
    vinext({
      prerender: true,
      cache: {
        cdn: staticAssetsAdapter(),
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
  css: {
    modules: {
      generateScopedName(name: string, filename: string) {
        const relativePath = path.relative(import.meta.dirname, filename.replace(/\?.*$/, '')).replaceAll('\\', '/');

        return `_${name}_${createHash('sha256').update(relativePath).digest('hex').slice(0, 7)}`;
      },
    },
  },
});
