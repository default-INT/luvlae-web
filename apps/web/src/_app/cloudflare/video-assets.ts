interface AssetEnvironment {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
}

const mediaTypes: Record<string, string> = {
  '/video/product-video.webm': 'video/webm',
  '/video/product-video.mp4': 'video/mp4',
};

export const serveVideoAsset = async (request: Request, env: unknown): Promise<Response | null> => {
  const type = mediaTypes[new URL(request.url).pathname];

  if (!type || !['GET', 'HEAD'].includes(request.method)) return null;

  const assetRequest = new Request(request);
  assetRequest.headers.delete('Range');
  const asset = await (env as AssetEnvironment).ASSETS.fetch(assetRequest);

  if (!asset.ok) return asset;

  const headers = new Headers(asset.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Type', type);
  const range = request.headers.get('Range');

  if (!range || request.method === 'HEAD') {
    return new Response(request.method === 'HEAD' ? null : asset.body, { status: asset.status, headers });
  }

  // Static Assets currently ignores Range; these small, bounded files need explicit byte slicing for Safari.
  const bytes = await asset.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const suffix = match?.[1] === '';
  const start = suffix ? Math.max(0, bytes.byteLength - Number(match?.[2])) : Number(match?.[1]);
  const end = suffix || !match?.[2] ? bytes.byteLength - 1 : Math.min(Number(match[2]), bytes.byteLength - 1);

  const valid = match && (match[1] || match[2]) && Number.isSafeInteger(start) && Number.isSafeInteger(end)
    && start >= 0 && start <= end && start < bytes.byteLength;

  if (!valid) {
    headers.set('Content-Range', `bytes */${bytes.byteLength}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, headers });
  }

  headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`);
  headers.set('Content-Length', String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
};
