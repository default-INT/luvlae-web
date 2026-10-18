import { bindings, defineConfig, defineWorker } from 'cf/config';

export default defineConfig(({ mode }) => {
  if (mode && !['stage', 'production', 'development'].includes(mode)) {
    throw new Error(`Unsupported Cloudflare mode: ${mode}`);
  }

  return {
    worker: defineWorker({
      name: mode === 'stage' ? 'luvlae-web-stage' : 'luvlae-web',
      ...(mode === 'stage' ? { workersDev: true, previewUrls: false } : {}),
      entrypoint: mode === 'stage' ? './src/_app/cloudflare/stage-worker.ts' : 'vinext/server/fetch-handler',
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
  };
});
