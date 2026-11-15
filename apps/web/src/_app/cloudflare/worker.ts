import worker from 'vinext/server/fetch-handler';

import { dispatchNotificationBatch } from '@/_app/commerce/notification-dispatch.server';
import { readEmailConfiguration } from '@/shared/lib/email/index.server';
import { withDatabase } from '@/shared/lib/mongodb/index.server';

import { serveVideoAsset } from './video-assets';

const appWorker = {
  ...worker,
  async fetch(request: Request, env: unknown, context: unknown): Promise<Response> {
    const response: Response = await serveVideoAsset(request, env) ?? await worker.fetch(request, env, context);

    if (readEmailConfiguration().environment !== 'stage') return response;

    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  async scheduled(): Promise<void> {
    await withDatabase(({ db }) => dispatchNotificationBatch(db));
  },
};

export default appWorker;
