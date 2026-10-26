import 'server-only';

import { Webhook } from 'svix';

export interface EmailConfiguration {
  enabled: boolean;
  environment: 'stage' | 'development' | 'production';
  from: string;
  replyTo?: string;
  appOrigin?: string;
  subjectPrefix: string;
}

export interface TransactionalEmail {
  from?: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  idempotencyKey: string;
  jobId: string;
}

export class EmailDeliveryError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly retryAfterMs?: number;

  constructor(code: string, options: { retryable?: boolean; ambiguous?: boolean; retryAfterMs?: number } = {}) {
    super(code);
    this.name = 'EmailDeliveryError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.ambiguous = options.ambiguous ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

const emailAddress = /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/;
const defaultSender = 'Luvlae <notify@luvlae.com>';
const maxWebhookBytes = 64 * 1024;
const validAddress = (value: string) => emailAddress.test(value) && !/[\r\n]/.test(value);
const optional = (value: string | undefined) => value?.trim() || undefined;

export const readEmailConfiguration = (): EmailConfiguration => {
  const environment = process.env.APP_ENV || 'development';

  if (environment !== 'stage' && environment !== 'development' && environment !== 'production') {
    throw new EmailDeliveryError('EMAIL_ENVIRONMENT_INVALID');
  }

  const enabled = environment === 'stage' || environment === 'production';
  const from = optional(process.env.EMAIL_FROM) ?? defaultSender;
  const replyTo = optional(process.env.EMAIL_REPLY_TO);
  const appOrigin = optional(process.env.APP_ORIGIN);
  const subjectPrefix = environment === 'stage' ? '[STAGE] ' : '';

  if (enabled) {
    if (!from || /[\r\n]/.test(from) || !validAddress(from.match(/<([^>]+)>/)?.[1] ?? from)) {
      throw new EmailDeliveryError('EMAIL_FROM_INVALID');
    }

    if (replyTo && !validAddress(replyTo)) throw new EmailDeliveryError('EMAIL_REPLY_TO_INVALID');

    if (appOrigin) {
      try {
        const url = new URL(appOrigin);

        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
          throw new Error('Invalid origin');
        }
      } catch {
        throw new EmailDeliveryError('EMAIL_APP_ORIGIN_INVALID');
      }
    }
  }

  return { enabled, environment, from, subjectPrefix,
    ...(replyTo ? { replyTo } : {}), ...(appOrigin ? { appOrigin } : {}) };
};

// Freeze these fields in the outbox before the first provider request.
export const prepareTransactionalEmail = (input: TransactionalEmail): TransactionalEmail => {
  const configuration = readEmailConfiguration();

  if (!configuration.enabled) throw new EmailDeliveryError('EMAIL_DISABLED');

  if (!optional(process.env.RESEND_API_KEY)) throw new EmailDeliveryError('EMAIL_PROVIDER_NOT_CONFIGURED');

  if (!validAddress(input.to) || !input.subject.trim() || /[\r\n]/.test(input.subject) ||
    !input.html.trim() || !input.text.trim() || !/^[A-Za-z0-9_/-]{1,256}$/.test(input.idempotencyKey) ||
    !/^[A-Za-z0-9_-]{1,256}$/.test(input.jobId)) {
    throw new EmailDeliveryError('EMAIL_PAYLOAD_INVALID');
  }

  if (input.from && input.from !== configuration.from) {
    throw new EmailDeliveryError('EMAIL_SENDER_CHANGED');
  }

  if (input.from && input.replyTo !== configuration.replyTo) {
    throw new EmailDeliveryError('EMAIL_REPLY_TO_CHANGED');
  }

  const subject = configuration.subjectPrefix && !input.subject.startsWith(configuration.subjectPrefix)
    ? `${configuration.subjectPrefix}${input.subject}`
    : input.subject;

  return { ...input, from: configuration.from, subject, replyTo: configuration.replyTo };
};

const retryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;

  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();

  return Number.isFinite(milliseconds) && milliseconds > 0 ? Math.min(milliseconds, 86_400_000) : undefined;
};

export const sendTransactionalEmail = async (input: TransactionalEmail): Promise<{ id: string }> => {
  const email = prepareTransactionalEmail(input);
  const configuration = readEmailConfiguration();
  const key = optional(process.env.RESEND_API_KEY);

  if (!key) throw new EmailDeliveryError('EMAIL_PROVIDER_NOT_CONFIGURED');

  let response: Response;

  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': email.idempotencyKey,
      },
      body: JSON.stringify({
        from: email.from ?? configuration.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        tags: [{ name: 'job', value: email.jobId }],
      }),
    });
  } catch {
    throw new EmailDeliveryError('EMAIL_PROVIDER_OUTCOME_UNKNOWN', { retryable: true, ambiguous: true });
  }

  if (!response.ok) {
    const retryAfterMs = retryAfter(response.headers.get('Retry-After'));

    if (response.status === 429) {
      throw new EmailDeliveryError('EMAIL_PROVIDER_RATE_LIMITED', { retryable: true, retryAfterMs });
    }

    if (response.status >= 500) {
      throw new EmailDeliveryError('EMAIL_PROVIDER_OUTCOME_UNKNOWN', {
        retryable: true, ambiguous: true, retryAfterMs,
      });
    }

    throw new EmailDeliveryError('EMAIL_PROVIDER_REJECTED');
  }

  try {
    const result: unknown = await response.json();

    if (typeof result === 'object' && result !== null && 'id' in result &&
      typeof result.id === 'string' && result.id.length > 0) {
      return { id: result.id };
    }
  } catch {
    // A successful response with no usable ID has an uncertain outcome.
  }

  throw new EmailDeliveryError('EMAIL_PROVIDER_OUTCOME_UNKNOWN', { retryable: true, ambiguous: true });
};

export interface ResendWebhookEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
}

export const verifyResendWebhook = async (request: Request): Promise<ResendWebhookEvent> => {
  const secret = optional(process.env.RESEND_WEBHOOK_SECRET);

  if (!secret) throw new EmailDeliveryError('EMAIL_WEBHOOK_NOT_CONFIGURED');

  const length = Number(request.headers.get('Content-Length'));

  if (Number.isFinite(length) && length > maxWebhookBytes) {
    throw new EmailDeliveryError('EMAIL_WEBHOOK_INVALID');
  }

  const headers = {
    'svix-id': request.headers.get('svix-id') ?? '',
    'svix-timestamp': request.headers.get('svix-timestamp') ?? '',
    'svix-signature': request.headers.get('svix-signature') ?? '',
  };

  if (Object.values(headers).some(value => !value)) throw new EmailDeliveryError('EMAIL_WEBHOOK_INVALID');

  let event: unknown;

  try {
    if (!request.body) throw new Error('Empty webhook');

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      total += value.byteLength;

      if (total > maxWebhookBytes) {
        await reader.cancel();
        throw new Error('Oversize webhook');
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;

    chunks.forEach(chunk => {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    });
    const body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    new Webhook(secret).verify(body, headers);
    event = JSON.parse(body);
  } catch {
    throw new EmailDeliveryError('EMAIL_WEBHOOK_INVALID');
  }

  if (typeof event !== 'object' || event === null ||
    !('type' in event) || typeof event.type !== 'string' ||
    !('created_at' in event) || typeof event.created_at !== 'string' ||
    !('data' in event) || typeof event.data !== 'object' || event.data === null || Array.isArray(event.data)) {
    throw new EmailDeliveryError('EMAIL_WEBHOOK_INVALID');
  }

  return { ...event, id: headers['svix-id'] } as ResendWebhookEvent;
};
