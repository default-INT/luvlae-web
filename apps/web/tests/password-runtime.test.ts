import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';

test('password creation, verification and unknown-account work stay within the deployed Workers PBKDF2 cap', async context => {
  const nativePbkdf2 = crypto.pbkdf2;
  const requests: number[] = [];

  const cappedPbkdf2: typeof crypto.pbkdf2 = (password, salt, iterations, length, digest, callback) => {
    requests.push(iterations);

    if (iterations > 100000) throw new DOMException('PBKDF2 iteration cap exceeded.', 'NotSupportedError');

    nativePbkdf2(password, salt, iterations, length, digest, callback);
  };

  context.mock.method(crypto, 'pbkdf2', cappedPbkdf2);
  syncBuiltinESMExports();
  context.after(() => { context.mock.restoreAll(); syncBuiltinESMExports(); });

  // Import after installing the production-only cap, which local workerd otherwise omits.
  const { hashPassword, verifyPassword, dummyPasswordHash } = await import('../src/shared/lib/security/index.server');
  const password = 'пароль-with-unicode-🔑-'.repeat(6);
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^pbkdf2-sha256\$100000\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  const salt = first.split('$')[2];
  assert.equal(first.split('$')[3], crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex'));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword('wrong-password', first), false);
  assert.equal(await verifyPassword(password, dummyPasswordHash), false);
  assert.ok(requests.length >= 5);
  assert.ok(requests.every(count => count === 100000));

  const beforeInvalid = requests.length;

  for (const stored of [
    first.replace('$100000$', '$600000$'), first.replace('$100000$', '$0100000$'),
    first.replace('pbkdf2-sha256', 'sha256'), `${first}$extra`, 'malformed-hash',
    first.replace(salt, 'invalid-salt'), first.slice(0, -1),
  ]) {
    assert.equal(await verifyPassword(password, stored), false);
  }

  assert.equal(requests.length, beforeInvalid);
});
