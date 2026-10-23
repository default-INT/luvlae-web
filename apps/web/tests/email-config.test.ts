import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import config from '../cloudflare.config';

const previous = new Map<string, string | undefined>();
const names = ['EMAIL_CONFIGURED', 'EMAIL_FROM', 'EMAIL_REPLY_TO', 'APP_ORIGIN'] as const;

beforeEach(() => {
  for (const name of names) {
    previous.set(name, process.env[name]);
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of names) {
    const value = previous.get(name);

    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const emailSecrets = (mode: string) => Object.entries(config({ mode, isPreview: false }).worker.env)
  .filter(([name, binding]) => /^(EMAIL_|RESEND_)/.test(name) && binding.type === 'secret')
  .map(([name]) => name).sort();

test('default stage does not require any email secrets for deployment', () => {
  const stage = config({ mode: 'stage', isPreview: false });
  assert.deepEqual(emailSecrets('stage'), []);
  assert.deepEqual(stage.worker.env.EMAIL_CONFIGURED, { type: 'text', value: 'false' });
  assert.equal(stage.worker.env.EMAIL_FROM?.type, 'text');
  assert.equal(stage.worker.env.EMAIL_REPLY_TO?.type, 'text');
  assert.equal(stage.worker.env.APP_ORIGIN?.type, 'text');
});

test('configured stage requires only the independent runtime switch, inbox and provider secrets', () => {
  process.env.EMAIL_CONFIGURED = 'true';
  assert.deepEqual(emailSecrets('stage'), [
    'EMAIL_ENABLED', 'EMAIL_STAGE_RECIPIENT', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET',
  ]);
});

test('stage configuration cannot introduce email dependencies into production', () => {
  process.env.EMAIL_CONFIGURED = 'true';
  const production = config({ mode: 'production', isPreview: false });
  assert.deepEqual(emailSecrets('production'), []);
  assert.equal(production.worker.env.EMAIL_CONFIGURED, undefined);
  assert.equal(production.worker.triggers, undefined);
});
