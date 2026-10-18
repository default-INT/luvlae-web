import worker from 'vinext/server/fetch-handler';

const stageWorker = {
  ...worker,
  async fetch(request: Request, env: unknown, context: unknown): Promise<Response> {
    const response: Response = await worker.fetch(request, env, context);
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

export default stageWorker;
