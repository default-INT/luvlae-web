import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

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
