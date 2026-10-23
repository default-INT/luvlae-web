import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { renderNotificationEmail } from '../src/_app/emails/index.server';

import type { NotificationContent, NotificationEvent } from '../src/_app/emails/types';

const previewDirectory = '/tmp/luvlae-email-previews';

const events: NotificationEvent[] = [
  'order.paid',
  'admin.order-paid',
  'order.processing',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'refund.succeeded',
];

const contentFor = (type: NotificationEvent): NotificationContent => ({
  type,
  orderNumber: 'LV-1042',
  customerName: 'Jamie Sample with a Longer Name',
  items: [
    { name: 'Luvlae product bundle with a longer sample product name', quantity: 2, unitAmount: 1800, lineSubtotal: 3600 },
    { name: 'Second item for a multi-item order', quantity: 1, unitAmount: 950, lineSubtotal: 950 },
  ],
  currency: 'USD',
  total: 4550,
  carrier: 'UPS',
  trackingNumber: '1Z 999 AA1',
  refundAmount: 1800,
  adminUrl: 'https://stage.luvlae.com/admin/orders/LV-1042',
  supportEmail: 'help@luvlae.com',
});

await mkdir(previewDirectory, { recursive: true });

for (const type of events) {
  const email = renderNotificationEmail(contentFor(type));
  const fileName = type.replaceAll('.', '-');

  await writeFile(join(previewDirectory, `${fileName}.html`), email.html, 'utf8');
  await writeFile(join(previewDirectory, `${fileName}.txt`), email.text, 'utf8');
}

process.stdout.write(`Wrote email previews to ${previewDirectory}\n`);
