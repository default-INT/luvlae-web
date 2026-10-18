import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getDeployment, verifyArtifact } from './cloudflare.mjs';

test('stage and production have distinct Workers; unknown environments fail closed', () => {
  assert.equal(getDeployment('stage').worker, 'luvlae-web-stage');
  assert.equal(getDeployment('production').worker, 'luvlae-web');
  assert.throws(() => getDeployment('stgae'), /Unsupported/);
  assert.throws(() => getDeployment(''), /Unsupported/);
});

test('refuses missing or mismatched deployment artifacts', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'luvlae-artifact-'));
  try {
    const output = path.join(root, '.cloudflare/output/v0/workers/default');
    mkdirSync(output, { recursive: true });
    assert.throws(() => verifyArtifact(root, getDeployment('stage')));
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web-stage' }));
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: 'stage' }));
    assert.throws(() => verifyArtifact(root, getDeployment('stage')));
    mkdirSync(path.join(output, 'assets'));
    writeFileSync(path.join(output, 'assets/_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n');
    assert.equal(verifyArtifact(root, getDeployment('stage')), output);
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /Rebuild/);
    writeFileSync(path.join(output, 'worker.config.json'), JSON.stringify({ name: 'luvlae-web' }));
    assert.throws(() => verifyArtifact(root, getDeployment('stage')), /Rebuild/);
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /Rebuild/);
    writeFileSync(path.join(output, 'deployment.json'), JSON.stringify({ environment: 'production' }));
    assert.throws(() => verifyArtifact(root, getDeployment('production')), /static headers/);
    rmSync(path.join(output, 'assets/_headers'));
    assert.equal(verifyArtifact(root, getDeployment('production')), output);
    writeFileSync(path.join(output, 'assets/_headers'), '/_next/static/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    assert.equal(verifyArtifact(root, getDeployment('production')), output);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
