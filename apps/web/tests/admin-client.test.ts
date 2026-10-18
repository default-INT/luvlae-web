import assert from 'node:assert/strict';
import { test } from 'node:test';

import { adminRequest, AdminApiError } from '../src/_pages/admin/api/admin';
import { orderSelection, ordersUrl, readOrderFilters } from '../src/_pages/admin/model/navigation';

test('opening and closing an order preserves filters without including the drawer selection in API filters', () => {
  const id = '6ad4d8376db4855a0d19235a';

  const params = new URLSearchParams({
    paymentStatus: 'paid', fulfillmentStatus: 'processing', from: '2026-10-01', cursor: 'next-page', order: id,
  });

  const filters = readOrderFilters(params);
  assert.equal(orderSelection(params), id);
  assert.equal('order' in filters, false);
  const closed = new URL(ordersUrl(filters), 'https://test.local');
  assert.equal(closed.searchParams.has('order'), false);
  assert.equal(closed.searchParams.get('cursor'), 'next-page');
  assert.equal(closed.searchParams.get('fulfillmentStatus'), 'processing');
  assert.equal(closed.searchParams.get('from'), '2026-10-01');
  assert.equal(orderSelection(new URL(ordersUrl(filters, id), 'https://test.local').searchParams), id);
  for (const order of ['', '../products', 'unknown', 'A'.repeat(24)]) {
    assert.equal(orderSelection(new URLSearchParams({ order })), null);
  }
});

test('admin fetch cancels stale reads, bypasses cache and exposes API errors to client feedback', async context => {
  const requests: RequestInit[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    requests.push(options);
    return Response.json({ data: { version: 1 } });
  });
  const controller = new AbortController();
  assert.deepEqual(await adminRequest('/orders', undefined, 'GET', controller.signal), { version: 1 });
  assert.equal(requests[0].cache, 'no-store');
  assert.equal(requests[0].signal?.aborted, false);
  controller.abort();
  assert.equal(requests[0].signal?.aborted, true);

  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 }));
  await assert.rejects(adminRequest('/orders'), error => error instanceof AdminApiError
    && error.status === 401 && error.code === 'UNAUTHORIZED');
});
