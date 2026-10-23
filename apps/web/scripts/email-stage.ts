import { randomUUID } from 'node:crypto';

import nextEnv from '@next/env';

import { prepareTransactionalEmail, readEmailConfiguration, sendTransactionalEmail } from '../src/shared/lib/email/index.server';
import { renderNotificationEmail } from '../src/_app/emails/index.server';

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const command = process.argv[2] ?? '--check';

if (!['--check', '--send'].includes(command) || process.argv.length > 3) {
  throw new Error('Usage: email-stage.ts [--check | --send]');
}

const config = readEmailConfiguration();

if (config.environment === 'production') {
  throw new Error('Stage diagnostic is unavailable in production.');
}

if (!config.enabled || !config.stageRecipient) {
  throw new Error('Stage email is disabled or missing its account-owned recipient.');
}

if (command === '--check') {
  prepareTransactionalEmail({ to: config.stageRecipient, subject: 'Configuration check',
    html: '<p>Check</p>', text: 'Check', idempotencyKey: 'email/config-check', jobId: 'config_check' });
  process.stdout.write('Stage email configuration is valid. No email was sent.\n');
} else {
  const jobId = `diagnostic_${randomUUID().replaceAll('-', '')}`;

  const rendered = renderNotificationEmail({ type: 'order.paid', orderNumber: 'STAGE-PREVIEW',
    customerName: 'Test Customer', currency: 'USD', total: 2500,
    items: [{ name: 'Sample product', quantity: 1, unitAmount: 2500, lineSubtotal: 2500 }] });

  const result = await sendTransactionalEmail({
    to: config.stageRecipient,
    ...rendered,
    idempotencyKey: `email/${jobId}`,
    jobId,
  });

  process.stdout.write(`Resend accepted stage diagnostic ${result.id}. Check the configured inbox.\n`);
}
