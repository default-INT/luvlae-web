import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import config from '../cloudflare.config';

const previous = new Map<string, string | undefined>();
const names = ['EMAIL_FROM', 'EMAIL_REPLY_TO', 'APP_ORIGIN'] as const;

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

test('stage always declares provider and webhook secrets without an activation gate', () => {
  const stage = config({ mode: 'stage', isPreview: false });
  assert.deepEqual(emailSecrets('stage'), ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET']);
  assert.equal(stage.worker.env.EMAIL_FROM?.type, 'text');
  assert.equal(stage.worker.env.EMAIL_REPLY_TO?.type, 'text');
  assert.equal(stage.worker.env.APP_ORIGIN?.type, 'text');
});

test('email credentials and scheduler remain stage-only', () => {
  const production = config({ mode: 'production', isPreview: false });
  assert.deepEqual(emailSecrets('production'), []);
  assert.equal(production.worker.triggers, undefined);
});
