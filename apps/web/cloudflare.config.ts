import { bindings, defineConfig, defineWorker } from 'cf/config';

export default defineConfig(({ mode }) => {
  if (mode && !['stage', 'production', 'development'].includes(mode)) {
    throw new Error(`Unsupported Cloudflare mode: ${mode}`);
  }

  const stripeMode = process.env.STRIPE_MODE ?? 'test';
  const checkoutEnabled = process.env.STRIPE_CHECKOUT_ENABLED === 'true';
  const production = mode === 'production';
  const environment = ['stage', 'production'].includes(mode ?? '') ? mode! : 'development';

  if (!['test', 'live'].includes(stripeMode) || (stripeMode === 'live' && !production)) {
    throw new Error('Stripe mode must be test, or live in production only.');
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
        APP_ENV: bindings.text(environment),
        MOCK_CHECKOUT_ENABLED: bindings.text(mode === 'stage' ? 'true' : 'false'),
        STRIPE_MODE: bindings.text(stripeMode),
        STRIPE_CHECKOUT_ENABLED: bindings.text(checkoutEnabled ? 'true' : 'false'),
        NEXT_MONGODB_USERNAME: bindings.secret(),
        NEXT_MONGODB_PASSWORD: bindings.secret(),
        NEXT_MONGODB_URI: bindings.secret(),
        NEXT_MONGODB_DB_NAME: bindings.secret(),
        ...(mode === 'stage' || checkoutEnabled || stripeMode === 'live' ? {
          STRIPE_SECRET_KEY: bindings.secret(),
          STRIPE_WEBHOOK_SECRET: bindings.secret(),
        } : {}),
        ...(checkoutEnabled ? { STRIPE_PUBLISHABLE_KEY: bindings.secret() } : {}),
      },
    }),
  };
});
