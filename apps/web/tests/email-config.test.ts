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

test('stage and production declare the same email runtime bindings and scheduler', () => {
  const stage = config({ mode: 'stage', isPreview: false });
  const production = config({ mode: 'production', isPreview: false });

  for (const [mode, worker] of [['stage', stage.worker], ['production', production.worker]] as const) {
    assert.deepEqual(emailSecrets(mode), ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET']);
    assert.equal(worker.env.EMAIL_FROM?.type, 'text');
    assert.equal(worker.env.EMAIL_REPLY_TO?.type, 'text');
    assert.equal(worker.env.APP_ORIGIN?.type, 'text');
    assert.equal(worker.entrypoint, './src/_app/cloudflare/worker.ts');
    assert.equal(worker.triggers?.length, 1);
  }
});
