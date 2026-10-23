import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getDeployment, verifyArtifact } from './cloudflare.mjs';

test('stage and production have distinct Workers; unknown environments fail closed', () => {
  assert.equal(getDeployment('stage').worker, 'luvlae-web-stage');
  assert.equal(getDeployment('stage').stripe.disabled, 'false');
  assert.equal(getDeployment('production').worker, 'luvlae-web');
  assert.throws(() => getDeployment('stgae'), /Unsupported/);
  assert.throws(() => getDeployment(''), /Unsupported/);
  assert.equal(getDeployment('stage').emailConfigured, false);
  assert.equal(getDeployment('stage', { EMAIL_CONFIGURED: 'true' }).emailConfigured, true);
  assert.equal(getDeployment('production', { EMAIL_CONFIGURED: 'true' }).emailConfigured, false);
  assert.throws(() => getDeployment('stage', { EMAIL_CONFIGURED: 'yes' }), /EMAIL_CONFIGURED/);
});

test('refuses missing or mismatched deployment artifacts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'luvlae-artifact-'));
  try {
    const output = path.join(root, '.cloudflare/output/v0/workers/default');
    mkdirSync(output, { recursive: true });
    assert.throws(() => verifyArtifact(root, getDeployment('stage')));
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web-stage', env: { STRIPE_MODE: { value: 'test' }, STRIPE_CHEKOUT_DISABLED: { value: 'false' } } }));
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: 'stage', stripe: { mode: 'test', disabled: 'false' } }));
    assert.throws(() => verifyArtifact(root, getDeployment('stage')));
    mkdirSync(path.join(output, 'assets'));
    writeFileSync(path.join(output, 'assets/_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n');
    assert.equal(verifyArtifact(root, getDeployment('stage')), output);
    assert.throws(() => verifyArtifact(root, getDeployment('stage', { EMAIL_CONFIGURED: 'true' })), /Email/);
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /Rebuild/);
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web', env: { STRIPE_MODE: { value: 'test' }, STRIPE_CHEKOUT_DISABLED: { value: 'false' } } }));
    assert.throws(() => verifyArtifact(root, getDeployment('stage')), /Rebuild/);
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /Rebuild/);
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: 'production', stripe: { mode: 'test', disabled: 'false' } }));
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /static headers/);
    rmSync(path.join(output, 'assets/_headers'));
    assert.equal(verifyArtifact(root, getDeployment('production')), output);
    writeFileSync(path.join(output, 'assets/_headers'), '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    assert.equal(verifyArtifact(root, getDeployment('production')), output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('Stripe deployment rejects invalid/live-stage inputs and never reuses artifacts with different activation', () => {
  assert.throws(() => getDeployment('stage', { STRIPE_MODE: 'live' }), /Stage/);
  assert.throws(() => getDeployment('production', { STRIPE_MODE: 'typo' }), /Invalid/);
  assert.throws(() => getDeployment('production', { STRIPE_CHEKOUT_DISABLED: 'yes' }), /Invalid/);
  const root = mkdtempSync(path.join(os.tmpdir(), 'luvlae-stripe-artifact-'));
  try {
    const output = path.join(root, '.cloudflare/output/v0/workers/default');
    mkdirSync(output, { recursive: true });
    const stripe = { mode: 'live', disabled: 'false' };
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web', env: {
      STRIPE_MODE: { value: 'live' }, STRIPE_CHEKOUT_DISABLED: { value: 'false' },
    } }));
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: 'production', stripe }));
    const live = getDeployment('production', { STRIPE_MODE: 'live', STRIPE_CHEKOUT_DISABLED: 'false' });
    assert.equal(verifyArtifact(root, live), output);
    assert.throws(() => verifyArtifact(root, getDeployment('production', {
      STRIPE_MODE: 'live', STRIPE_CHEKOUT_DISABLED: 'true',
    })), /Stripe/);
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /Stripe/);
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web', env: {
      STRIPE_MODE: { value: 'test' }, STRIPE_CHEKOUT_DISABLED: { value: 'false' },
    } }));
    assert.throws(() => verifyArtifact(root, live), /Stripe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
