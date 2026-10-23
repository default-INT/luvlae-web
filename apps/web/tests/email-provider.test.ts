import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { Webhook } from 'svix';

import {
  EmailDeliveryError, prepareTransactionalEmail, readEmailConfiguration,
  sendTransactionalEmail, verifyResendWebhook,
} from '../src/shared/lib/email/index.server';

const names = [
  'APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'EMAIL_CONFIGURED', 'EMAIL_ENABLED', 'EMAIL_FROM', 'EMAIL_STAGE_RECIPIENT',
  'EMAIL_REPLY_TO', 'APP_ORIGIN', 'RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET',
] as const;

const original = new Map<string, string | undefined>();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  names.forEach(name => {
    original.set(name, process.env[name]);
    delete process.env[name];
  });
  process.env.APP_ENV = 'stage';
  process.env.EMAIL_ENABLED = 'true';
  process.env.EMAIL_STAGE_RECIPIENT = 'account@example.test';
  process.env.RESEND_API_KEY = 're_synthetic';
});

afterEach(() => {
  names.forEach(name => {
    const value = original.get(name);

    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
  globalThis.fetch = originalFetch;
});

const input = {
  to: 'buyer@example.test', subject: 'Order confirmed', html: '<p>Ready</p>', text: 'Ready',
  idempotencyKey: 'email/job-123', jobId: 'job_123',
};

const hasCode = (code: string) => (error: unknown) => error instanceof EmailDeliveryError && error.code === code;

test('disabled by default; stage routes every recipient through one inbox and freezes sender fields', async () => {
  delete process.env.EMAIL_ENABLED;
  assert.equal(readEmailConfiguration().enabled, false);
  await assert.rejects(sendTransactionalEmail(input), hasCode('EMAIL_DISABLED'));

  process.env.EMAIL_ENABLED = 'true';
  process.env.EMAIL_REPLY_TO = 'support@example.test';
  const frozen = prepareTransactionalEmail(input);
  assert.equal(frozen.to, 'account@example.test');
  assert.equal(frozen.subject, '[STAGE] Order confirmed');
  assert.equal(frozen.from, 'Luvlae Stage <onboarding@resend.dev>');
  assert.equal(frozen.replyTo, 'support@example.test');

  let body: Record<string, unknown> | undefined;

  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.headers && new Headers(init.headers).get('Idempotency-Key'), input.idempotencyKey);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ id: 'provider-123' });
  };

  assert.deepEqual(await sendTransactionalEmail(frozen), { id: 'provider-123' });
  assert.deepEqual(body?.to, ['account@example.test']);
  assert.equal(body?.subject, '[STAGE] Order confirmed');
  assert.deepEqual(body?.tags, [{ name: 'job', value: input.jobId }]);
  assert.equal(body?.reply_to, 'support@example.test');
});

test('stage refuses destination or sender drift after payload is frozen', async () => {
  const frozen = prepareTransactionalEmail(input);
  process.env.EMAIL_STAGE_RECIPIENT = 'changed@example.test';
  await assert.rejects(sendTransactionalEmail(frozen), hasCode('EMAIL_STAGE_DESTINATION_CHANGED'));
  process.env.EMAIL_STAGE_RECIPIENT = 'account@example.test';
  process.env.EMAIL_FROM = 'Changed <onboarding@resend.dev>';
  await assert.rejects(sendTransactionalEmail(frozen), hasCode('EMAIL_SENDER_CHANGED'));
});

test('production cannot use stage sender or routing', () => {
  process.env.APP_ENV = 'production';
  process.env.NEXT_PUBLIC_APP_ENV = 'production';
  assert.throws(readEmailConfiguration, hasCode('EMAIL_FROM_INVALID'));
  process.env.EMAIL_FROM = 'Luvlae <onboarding@resend.dev>';
  assert.throws(readEmailConfiguration, hasCode('EMAIL_PRODUCTION_CONFIGURATION_INVALID'));
  process.env.EMAIL_FROM = 'Luvlae <orders@luvlae.com>';
  assert.throws(readEmailConfiguration, hasCode('EMAIL_PRODUCTION_CONFIGURATION_INVALID'));
  delete process.env.EMAIL_STAGE_RECIPIENT;
  assert.equal(readEmailConfiguration().environment, 'production');
});

test('unconfigured deployed stage remains disabled even when an old runtime switch is true', () => {
  process.env.EMAIL_CONFIGURED = 'false';
  assert.equal(readEmailConfiguration().enabled, false);
  process.env.EMAIL_CONFIGURED = 'true';
  assert.equal(readEmailConfiguration().enabled, true);
});

test('provider failures classify rejection, rate limit, and unknown outcomes without provider details', async () => {
  globalThis.fetch = async () => new Response('private provider detail', { status: 422 });
  await assert.rejects(sendTransactionalEmail(input), error => {
    assert.ok(hasCode('EMAIL_PROVIDER_REJECTED')(error));
    assert.equal((error as EmailDeliveryError).retryable, false);
    assert.equal((error as Error).message.includes('private'), false);
    return true;
  });

  globalThis.fetch = async () => new Response('', { status: 429, headers: { 'Retry-After': '3' } });
  await assert.rejects(sendTransactionalEmail(input), error => {
    assert.ok(hasCode('EMAIL_PROVIDER_RATE_LIMITED')(error));
    assert.equal((error as EmailDeliveryError).retryAfterMs, 3000);
    return true;
  });

  globalThis.fetch = async () => { throw new Error('secret network detail'); };
  await assert.rejects(sendTransactionalEmail(input), error => {
    assert.ok(hasCode('EMAIL_PROVIDER_OUTCOME_UNKNOWN')(error));
    assert.equal((error as EmailDeliveryError).ambiguous, true);
    return true;
  });
});

test('Svix verifier accepts signed raw payload and rejects tampering', async () => {
  const secret = `whsec_${Buffer.from('synthetic-test-secret-123456789').toString('base64')}`;
  process.env.RESEND_WEBHOOK_SECRET = secret;

  const body = JSON.stringify({ type: 'email.delivered', created_at: '2026-10-22T00:00:00Z', data: {
    email_id: 'provider-123', tags: { job: 'job_123' },
  } });

  const signature = new Webhook(secret).sign('msg_synthetic', new Date(), body);

  const headers = { 'svix-id': 'msg_synthetic', 'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': signature };

  const request = (payload: string) => new Request('https://stage.example.test/api/webhooks/resend', {
    method: 'POST', body: payload, headers,
  });

  const event = await verifyResendWebhook(request(body));
  assert.equal(event.id, 'msg_synthetic');
  assert.equal(event.data.email_id, 'provider-123');
  await assert.rejects(verifyResendWebhook(request(body.replace('delivered', 'bounced'))),
    hasCode('EMAIL_WEBHOOK_INVALID'));
});
