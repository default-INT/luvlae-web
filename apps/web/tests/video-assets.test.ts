import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { test } from 'node:test';

import { serveVideoAsset } from '../src/_app/cloudflare/video-assets';

const env = { ASSETS: { fetch: async (request: Request) => {
  assert.equal(request.headers.get('Range'), null);
  return new Response(request.method === 'HEAD' ? null : '0123456789', {
    headers: { 'Content-Length': '10', ETag: '"video-v1"' },
  });
} } };

test('video ranges support Safari probes, open ends, suffixes and invalid ranges', async () => {
  for (const [range, status, content, value] of [
    ['bytes=0-1', 206, '01', 'bytes 0-1/10'],
    ['bytes=6-', 206, '6789', 'bytes 6-9/10'],
    ['bytes=-3', 206, '789', 'bytes 7-9/10'],
    ['bytes=8-99', 206, '89', 'bytes 8-9/10'],
    ['bytes=10-', 416, '', 'bytes */10'],
    ['bytes=5-2', 416, '', 'bytes */10'],
    ['bytes=-0', 416, '', 'bytes */10'],
  ] as const) {
    const response = await serveVideoAsset(new Request('https://example.com/video/product-video.mp4', {
      headers: { Range: range },
    }), env);

    assert.equal(response?.status, status);
    assert.equal(response?.headers.get('Content-Range'), value);
    assert.equal(response?.headers.get('Content-Type'), 'video/mp4');
    assert.equal(await response?.text(), content);
  }
});

test('full and HEAD responses preserve size, advertise ranges and ignore unrelated assets', async () => {
  const full = await serveVideoAsset(new Request('https://example.com/video/product-video.webm'), env);
  assert.equal(full?.status, 200);
  assert.equal(full?.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(full?.headers.get('Content-Type'), 'video/webm');
  assert.equal(await full?.text(), '0123456789');
  const head = await serveVideoAsset(new Request('https://example.com/video/product-video.mp4', { method: 'HEAD' }), env);
  assert.equal(head?.headers.get('Content-Length'), '10');
  assert.equal(await head?.text(), '');
  assert.equal(await serveVideoAsset(new Request('https://example.com/video/other.mp4'), env), null);
});

test('published videos fit Cloudflare Static Assets 25 MiB per-file limit', async () => {
  for (const extension of ['mp4', 'webm']) {
    const info = await stat(new URL(`../public/video/product-video.${extension}`, import.meta.url));
    assert.ok(info.size > 0 && info.size < 25 * 1024 * 1024);
  }
});
