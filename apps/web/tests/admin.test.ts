import assert from 'node:assert/strict';
import { test } from 'node:test';

import { orderListFilter } from '../src/_app/commerce/order-filters.server';
import { priceInCents } from '../src/_pages/admin/model/types';
import { sessionCookie } from '../src/_app/commerce/auth.server';
import { ApiError } from '../src/shared/lib/api/index.server';

test('admin order search treats user input literally and combines independent status and UTC date filters', () => {
  const filter = orderListFilter(new URLSearchParams({
    q: 'LV-.*[1]', orderStatus: 'open', paymentStatus: 'paid', fulfillmentStatus: 'processing',
    from: '2026-10-01', to: '2026-10-18',
  }));

  const regex = new RegExp(filter.orderNumber.$regex, filter.orderNumber.$options);
  assert.equal(regex.test('LV-.*[1]'), true);
  assert.equal(regex.test('LV-any-other-order'), false);
  assert.equal(filter.orderStatus, 'open');
  assert.equal(filter['payment.status'], 'paid');
  assert.equal(filter['fulfillment.status'], 'processing');
  assert.equal(filter.createdAt.$gte.toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(filter.createdAt.$lt.toISOString(), '2026-10-19T00:00:00.000Z');
  assert.deepEqual(orderListFilter(new URLSearchParams('q=&orderStatus=&from=&to=')), {});
});

test('admin filters reject invalid statuses, dates, ranges and oversized searches', () => {
  const invalid: Record<string, string>[] = [{ paymentStatus: 'invented' }, { orderStatus: 'invented' },
    { fulfillmentStatus: 'invented' }, { from: '2026-02-30' }, { q: 'x'.repeat(101) }];

  for (const params of invalid) {
    assert.throws(() => orderListFilter(new URLSearchParams(params)));
  }

  assert.throws(() => orderListFilter(new URLSearchParams({ from: '2026-10-20', to: '2026-10-01' })),
    error => error instanceof ApiError && error.code === 'INVALID_RANGE');
});

test('admin price input preserves exact cents and rejects extra precision, zero, and unsafe amounts', () => {
  assert.equal(priceInCents('29.99'), 2999);
  assert.equal(priceInCents('9.9'), 990);
  assert.equal(priceInCents('10'), 1000);
  assert.equal(priceInCents('0.01'), 1);

  for (const value of ['0', '-1', '1.005', '1e3', 'NaN', '', '99999999999999999999']) {
    assert.equal(priceInCents(value), null);
  }
});

test('admin session cookie covers both server pages and API while retaining HttpOnly, Strict and HTTPS protection', () => {
  const request = new Request('https://test.local/api/admin/auth/login');
  const cookie = sessionCookie('a'.repeat(43), request);
  assert.match(cookie, /luvlae_admin_v2=/);
  assert.match(cookie, /Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800; Secure/);
  assert.match(sessionCookie('', request, true), /Max-Age=0; Secure/);
});
