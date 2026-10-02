import { bindings, defineConfig, defineWorker } from 'cf/config';

export default defineConfig({
  worker: defineWorker({
    name: 'luvlae-web',
    entrypoint: 'vinext/server/fetch-handler',
    compatibilityDate: '2026-10-02',
    compatibilityFlags: ['nodejs_compat'],
    assets: {
      notFoundHandling: 'none',
      runWorkerFirst: ['/_vinext/static-cache/*'],
    },
    env: {
      ASSETS: bindings.assets(),
    },
  }),
});
