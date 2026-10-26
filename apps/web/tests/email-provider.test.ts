import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';

import { Webhook } from 'svix';

import {
  EmailDeliveryError, prepareTransactionalEmail, readEmailConfiguration,
  sendTransactionalEmail, verifyResendWebhook,
} from '../src/shared/lib/email/index.server';

const names = [
  'APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'EMAIL_FROM',
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

test('stage is enabled by default, sends to the requested recipient, and freezes sender fields', async () => {
  assert.equal(readEmailConfiguration().enabled, true);
  process.env.EMAIL_REPLY_TO = 'support@example.test';
  const frozen = prepareTransactionalEmail(input);
  assert.equal(frozen.to, input.to);
  assert.equal(frozen.subject, '[STAGE] Order confirmed');
  assert.equal(frozen.from, 'Luvlae <notify@luvlae.com>');
  assert.equal(frozen.replyTo, 'support@example.test');

  let body: Record<string, unknown> | undefined;

  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.headers && new Headers(init.headers).get('Idempotency-Key'), input.idempotencyKey);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({ id: 'provider-123' });
  };

  assert.deepEqual(await sendTransactionalEmail(frozen), { id: 'provider-123' });
  assert.deepEqual(body?.to, [input.to]);
  assert.equal(body?.subject, '[STAGE] Order confirmed');
  assert.deepEqual(body?.tags, [{ name: 'job', value: input.jobId }]);
  assert.equal(body?.reply_to, 'support@example.test');
});

test('stage refuses sender drift after payload is frozen', async () => {
  const frozen = prepareTransactionalEmail(input);
  process.env.EMAIL_FROM = 'Changed <notify@luvlae.com>';
  await assert.rejects(sendTransactionalEmail(frozen), hasCode('EMAIL_SENDER_CHANGED'));
});

test('production uses the same provider path without the stage subject prefix', () => {
  process.env.APP_ENV = 'production';
  const config = readEmailConfiguration();
  const frozen = prepareTransactionalEmail(input);
  assert.equal(config.environment, 'production');
  assert.equal(config.enabled, true);
  assert.equal(frozen.to, input.to);
  assert.equal(frozen.subject, input.subject);
  assert.equal(frozen.from, 'Luvlae <notify@luvlae.com>');
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
