import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const run = (args: string[], confirmation: string) => spawnSync(process.execPath, [
  '--conditions=react-server', '--import', 'tsx', 'scripts/stripe-reconcile.ts', ...args,
], {
  cwd: process.cwd(), encoding: 'utf8',
  env: { ...process.env, NEXT_MONGODB_DB_NAME: 'reconcile_cli_synthetic', DB_CONFIRM_NAME: confirmation },
});

test('operator reconciliation refuses wrong database confirmation before touching provider or database', () => {
  const result = run([], 'wrong-database');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DB_CONFIRMATION_REQUIRED/);
});

test('operator reconciliation validates batch and continuation cursor before any network access', () => {
  const batch = run(['101'], 'reconcile_cli_synthetic');
  const cursor = run(['20', 'invalid-cursor'], 'reconcile_cli_synthetic');
  assert.equal(batch.status, 1);
  assert.match(batch.stderr, /INVALID_LIMIT/);
  assert.equal(cursor.status, 1);
  assert.match(cursor.stderr, /INVALID_CURSOR/);
});
