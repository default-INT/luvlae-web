import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

// Operational entry point is JavaScript; importing it does not execute its CLI.
import { getDeployment, verifyArtifact } from '../scripts/cloudflare.mjs';

test('policy activation is validated and cannot reuse a stale deployment artifact', () => {
  assert.throws(() => getDeployment('stage', { SALES_TERMS_POLICY_VERSION: 'v2' }), /Provide both/);

  const deployment = getDeployment('stage', { STRIPE_CHEKOUT_DISABLED: 'true',
    SALES_TERMS_POLICY_VERSION: 'first-order-v2', SALES_TERMS_EFFECTIVE_AT: '2030-01-01T00:00:00Z' });

  const root = mkdtempSync(path.join(tmpdir(), 'luvlae-policy-build-'));
  const output = path.join(root, '.cloudflare/output/v0/workers/default');

  try {
    mkdirSync(path.join(output, 'assets'), { recursive: true });
    writeFileSync(path.join(output, 'assets/_headers'), '/*\n  X-Robots-Tag: noindex\n');

    const config = { name: deployment.worker, env: {
      STRIPE_MODE: { value: 'test' }, STRIPE_CHEKOUT_DISABLED: { value: 'true' },
      SALES_TERMS_POLICY_VERSION: { value: deployment.salesTerms.policyVersion },
      SALES_TERMS_EFFECTIVE_AT: { value: deployment.salesTerms.effectiveAt },
    } };

    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify(config));
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify(deployment));
    assert.equal(verifyArtifact(root, deployment), output);
    assert.throws(() => verifyArtifact(root, getDeployment('stage', { STRIPE_CHEKOUT_DISABLED: 'true' })), /Sales terms/);
    config.env.SALES_TERMS_POLICY_VERSION.value = 'stale';
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify(config));
    assert.throws(() => verifyArtifact(root, deployment), /Sales terms/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Turbo hashes and forwards policy activation for every Cloudflare command', () => {
  const config = JSON.parse(readFileSync(new URL('../../../turbo.json', import.meta.url), 'utf8'));

  for (const task of ['build:vinext', 'start:vinext', 'deploy:vinext']) {
    for (const key of ['SALES_TERMS_POLICY_VERSION', 'SALES_TERMS_EFFECTIVE_AT']) {
      assert.ok(config.tasks[task].env.includes(key), `${task} must hash and forward ${key}`);
    }
  }
});
