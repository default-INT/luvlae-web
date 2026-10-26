import { randomUUID } from 'node:crypto';

import nextEnv from '@next/env';

import { prepareTransactionalEmail, readEmailConfiguration, sendTransactionalEmail } from '../src/shared/lib/email/index.server';
import { renderNotificationEmail } from '../src/_app/emails/index.server';

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const [command = '--check', recipient] = process.argv.slice(2);

if (!['--check', '--send'].includes(command) || (command === '--check' && recipient) ||
  (command === '--send' && !recipient) || process.argv.length > (command === '--send' ? 4 : 3)) {
  throw new Error('Usage: email-stage.ts --check | --send <recipient-email>');
}

const config = readEmailConfiguration();
const targetAddress = command === '--send' ? recipient : undefined;

if (config.environment !== 'stage') {
  throw new Error('Set APP_ENV=stage to use the stage email diagnostic.');
}

if (!config.enabled) throw new Error('Stage email configuration is invalid.');

if (command === '--check') {
  prepareTransactionalEmail({ to: 'diagnostic@example.invalid', subject: 'Configuration check',
    html: '<p>Check</p>', text: 'Check', idempotencyKey: 'email/config-check', jobId: 'config_check' });
  process.stdout.write('Stage email configuration is valid. No email was sent.\n');
} else {
  if (!targetAddress) throw new Error('Pass a recipient email address to --send.');

  const jobId = `diagnostic_${randomUUID().replaceAll('-', '')}`;

  const rendered = renderNotificationEmail({ type: 'order.paid', orderNumber: 'STAGE-PREVIEW',
    customerName: 'Test Customer', currency: 'USD', total: 2500,
    items: [{ name: 'Sample product', quantity: 1, unitAmount: 2500, lineSubtotal: 2500 }] });

  const result = await sendTransactionalEmail({
    to: targetAddress,
    ...rendered,
    idempotencyKey: `email/${jobId}`,
    jobId,
  });

  process.stdout.write(`Resend accepted stage diagnostic ${result.id}. Check the recipient inbox.\n`);
}
