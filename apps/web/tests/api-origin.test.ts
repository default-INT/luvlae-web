import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ApiError, requireOrigin } from '../src/shared/lib/api/index.server';

const request = (url: string, headers: Record<string, string>) => new Request(`${url}/api/admin/auth/login`, {
  method: 'POST', headers,
});

const invalid = (value: Request) => assert.throws(() => requireOrigin(value),
  (error: unknown) => error instanceof ApiError && error.status === 403 && error.code === 'INVALID_ORIGIN');

test('origin matches browser Host when Next reconstructs a different listener hostname or port', () => {
  for (const [url, host, origin] of [
    ['http://localhost:3022', '127.0.0.1:3022', 'http://127.0.0.1:3022'],
    ['http://127.0.0.1:3000', 'localhost:3000', 'http://localhost:3000'],
    ['http://localhost:3000', 'localhost:3022', 'http://localhost:3022'],
    ['http://localhost:3000', '[::1]:3022', 'http://[::1]:3022'],
    ['https://internal.test', 'www.luvlae.com:443', 'https://www.luvlae.com'],
  ]) {
    assert.doesNotThrow(() => requireOrigin(request(url, { host, origin })));
  }
});

test('missing Host uses the request URL and never permits missing, null or mismatched Origin', () => {
  assert.doesNotThrow(() => requireOrigin(request('https://test.local', { origin: 'https://test.local' })));

  for (const origin of ['', 'null', 'https://attacker.test', 'http://test.local', 'https://test.local:444']) {
    invalid(request('https://test.local', { origin }));
  }

  invalid(request('https://test.local', {}));
});

test('cross-origin and forged proxy headers cannot override the actual destination Host', () => {
  invalid(request('http://localhost:3022', { host: '127.0.0.1:3022', origin: 'http://localhost:3022' }));
  invalid(request('https://internal.test', { host: 'www.luvlae.com', origin: 'https://attacker.test',
    'x-forwarded-host': 'attacker.test', 'x-forwarded-proto': 'https', forwarded: 'host=attacker.test;proto=https' }));
  invalid(request('https://test.local', { host: 'test.local', origin: 'https://test.local', 'sec-fetch-site': 'cross-site' }));
  invalid(request('http://localhost:3022', { host: 'localhost:3022', origin: 'https://localhost:3022',
    'x-forwarded-proto': 'https' }));
});

test('malformed present Host is rejected even when Origin matches the fallback URL', () => {
  for (const host of ['', 'test.local,attacker.test', 'test.local/path', 'user@test.local', 'test.local?query',
    'test.local#hash', 'test.local\\path', 'test.local :443', 'test.local:99999', '[::1', 'test%2elocal']) {
    invalid(request('https://test.local', { host, origin: 'https://test.local' }));
  }
});
