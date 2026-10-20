import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

import { readAdminCredentials } from '../scripts/db/admin-credentials';
import { ApiError } from '../src/shared/lib/api/index.server';

const appRoot = path.resolve(import.meta.dirname, '..');

for (const confirmation of ['', 'different-database']) {
  test(`CLI rejects ${confirmation ? 'mismatched' : 'missing'} DB confirmation before connection`, () => {
    const result = spawnSync(process.execPath, [
      '--conditions=react-server', '--import', 'tsx', 'scripts/db/cli.ts', 'migrate',
    ], {
      cwd: appRoot,
      env: {
        ...process.env,
        NEXT_MONGODB_DB_NAME: 'synthetic-stage',
        NEXT_MONGODB_URI: 'mongodb://never-connect.invalid/',
        DB_CONFIRM_NAME: confirmation,
      },
      encoding: 'utf8',
      timeout: 10000,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /DB_CONFIRMATION_REQUIRED/);
    assert.match(result.stderr, /Set DB_CONFIRM_NAME/);
    assert.doesNotMatch(result.stderr, /never-connect/);
    assert.doesNotMatch(result.stderr, /synthetic-stage/);
  });
}

for (const [email, password, code] of [
  ['', 'synthetic-password-123', 'ADMIN_EMAIL_REQUIRED'],
  ['invalid', 'synthetic-password-123', 'INVALID_ADMIN_EMAIL'],
  ['admin@example.test', '', 'ADMIN_PASSWORD_REQUIRED'],
  ['admin@example.test', 'too-short', 'ADMIN_PASSWORD_TOO_SHORT'],
  ['admin@example.test', 'x'.repeat(257), 'ADMIN_PASSWORD_TOO_LONG'],
]) {
  test(`admin credentials report ${code} without exposing values`, () => {
    assert.throws(() => readAdminCredentials({ ADMIN_EMAIL: email, ADMIN_PASSWORD: password }), error => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.code, code);

      if (password) assert.equal(error.message.includes(password), false);

      if (email) assert.equal(error.message.includes(email), false);

      return true;
    });
  });
}

test('admin credentials normalize email and preserve password exactly', () => {
  const password = ' synthetic-password-123 ';
  assert.deepEqual(readAdminCredentials({ ADMIN_EMAIL: ' ADMIN@EXAMPLE.TEST ', ADMIN_PASSWORD: password }), {
    email: 'admin@example.test', password,
  });
});
