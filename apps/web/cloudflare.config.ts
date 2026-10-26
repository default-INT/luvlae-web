import { bindings, defineConfig, defineWorker, triggers } from 'cf/config';

export default defineConfig(({ mode }) => {
  if (mode && !['stage', 'production', 'development'].includes(mode)) {
    throw new Error(`Unsupported Cloudflare mode: ${mode}`);
  }

  const stripeMode = process.env.STRIPE_MODE ?? 'test';
  const checkoutDisabled = process.env.STRIPE_CHEKOUT_DISABLED === 'true';
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
      ...(mode === 'stage' ? { triggers: [triggers.scheduled({ schedule: '* * * * *' })] } : {}),
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
        STRIPE_CHEKOUT_DISABLED: bindings.text(checkoutDisabled ? 'true' : 'false'),
        NEXT_MONGODB_USERNAME: bindings.secret(),
        NEXT_MONGODB_PASSWORD: bindings.secret(),
        NEXT_MONGODB_URI: bindings.secret(),
        NEXT_MONGODB_DB_NAME: bindings.secret(),
        ...(mode === 'stage' ? {
          EMAIL_FROM: bindings.text(process.env.EMAIL_FROM || 'Luvlae <notify@luvlae.com>'),
          EMAIL_REPLY_TO: bindings.text(process.env.EMAIL_REPLY_TO || 'notify@luvlae.com'),
          APP_ORIGIN: bindings.text(process.env.APP_ORIGIN || 'https://luvlae-web-stage.evgeniy-trofimov-int.workers.dev'),
          RESEND_API_KEY: bindings.secret(),
          RESEND_WEBHOOK_SECRET: bindings.secret(),
        } : {}),
        ...(mode === 'stage' || !checkoutDisabled || stripeMode === 'live' ? {
          STRIPE_SECRET_KEY: bindings.secret(),
          STRIPE_WEBHOOK_SECRET: bindings.secret(),
        } : {}),
        ...(!checkoutDisabled ? { STRIPE_PUBLISHABLE_KEY: bindings.secret() } : {}),
      },
    }),
  };
});
