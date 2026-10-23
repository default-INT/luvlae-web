import assert from 'node:assert/strict';
import test from 'node:test';

import { renderNotificationEmail } from '../src/_app/emails/index.server';

import type { NotificationContent, NotificationEvent } from '../src/_app/emails/types';

const sampleContent = (type: NotificationEvent): NotificationContent => ({
  type,
  orderNumber: 'LV-1042',
  customerName: 'Jamie',
  items: [
    { name: 'Daily patches', quantity: 2, unitAmount: 1800, lineSubtotal: 3600 },
    { name: 'Travel pack', quantity: 1, unitAmount: 950, lineSubtotal: 950 },
  ],
  currency: 'USD',
  total: 4550,
  carrier: 'UPS',
  trackingNumber: '1Z 999 AA1',
  refundAmount: 1800,
  adminUrl: 'https://stage.luvlae.com/admin/orders/LV-1042',
  supportEmail: 'help@luvlae.com',
});

const events: NotificationEvent[] = [
  'order.paid',
  'admin.order-paid',
  'order.processing',
  'order.shipped',
  'order.delivered',
  'order.cancelled',
  'refund.succeeded',
];

test('unpaid cancellation does not fabricate a zero final order total', () => {
  const rendered = renderNotificationEmail({ ...sampleContent('order.cancelled'),
    total: undefined, amountPaid: 0, refundAmount: undefined });

  assert.match(rendered.text, /Total: Not finalized/);
  assert.match(rendered.text, /No payment was collected/);
  assert.doesNotMatch(rendered.text, /Total: \$0\.00/);
  assert.match(rendered.html, /Not finalized/);
});

test('payment holds do not confirm fulfillment to buyers or administrators', () => {
  const buyer = renderNotificationEmail({ ...sampleContent('order.paid'), requiresReview: true });
  const admin = renderNotificationEmail({ ...sampleContent('admin.order-paid'), requiresReview: true });

  assert.match(buyer.subject, /Payment received/);
  assert.doesNotMatch(buyer.text, /order is confirmed/);
  assert.match(admin.text, /review required/);
  assert.match(admin.text, /before preparing or shipping/);
});

test('renders a branded HTML and text message for every notification event', () => {
  for (const type of events) {
    const rendered = renderNotificationEmail(sampleContent(type));

    assert.ok(rendered.subject.includes('LV-1042'));
    assert.ok(rendered.html.includes('LUVLAE'));
    assert.ok(rendered.html.includes('Order summary'));
    assert.ok(rendered.html.includes('Daily patches'));
    assert.ok(rendered.html.includes('$45.50'));
    assert.ok(!rendered.html.includes('Track your shipment') || type === 'order.shipped');
    assert.ok(!rendered.html.includes('Partial refund') || type === 'refund.succeeded');
    assert.ok(rendered.text.includes('Order summary:'));
    assert.ok(rendered.text.includes('Travel pack'));
    assert.ok(rendered.text.length > 100);
  }
});

test('escapes customer supplied content and builds tracking links from supported carriers', () => {
  const content = sampleContent('order.shipped');
  content.customerName = '<img src=x onerror=alert(1)>';
  content.items[0]!.name = '<script>alert("x")</script>';
  content.trackingNumber = '1Z 999 AA1&next=https://evil.example';

  const rendered = renderNotificationEmail(content);

  assert.ok(rendered.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(rendered.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'));
  assert.ok(!rendered.html.includes('<script>'));
  assert.ok(!rendered.html.includes('href="https://www.ups.com/track?tracknum=1Z%20999%20AA1&amp;next'));
  assert.ok(rendered.html.includes('Carrier:</strong> UPS'));
});

test('links to an explicitly supplied safe admin URL and omits unsafe URLs', () => {
  const content = sampleContent('admin.order-paid');
  const safe = renderNotificationEmail(content);

  assert.ok(safe.html.includes('href="https://stage.luvlae.com/admin/orders/LV-1042"'));
  assert.ok(safe.text.includes('Review order: https://stage.luvlae.com/admin/orders/LV-1042'));

  content.adminUrl = `${['java', 'script'].join('')}:alert(1)`;
  const unsafe = renderNotificationEmail(content);

  assert.ok(!unsafe.html.includes(`${['java', 'script'].join('')}:`));
  assert.ok(!unsafe.html.includes('Review order</a>'));
  assert.ok(!unsafe.text.includes('Review order:'));
});

test('formats integer USD cents and uses a safe greeting when the customer name is absent', () => {
  const content = sampleContent('order.paid');
  content.customerName = undefined;
  content.items[0]!.unitAmount = 2500;
  content.items[0]!.lineSubtotal = 2500;
  content.total = 2500;

  const rendered = renderNotificationEmail(content);

  assert.ok(rendered.html.includes('Hello there,'));
  assert.ok(rendered.html.includes('$25.00'));
  assert.ok(rendered.text.includes('$25.00'));
  assert.ok(!rendered.html.includes('$2,500.00'));
});

test('labels a successful refund as partial or full based on integer cents', () => {
  const content = sampleContent('refund.succeeded');
  const partial = renderNotificationEmail(content);

  assert.ok(partial.html.includes('Partial refund'));
  assert.ok(partial.text.includes('Partial refund: $18.00'));

  content.refundAmount = content.total;
  const full = renderNotificationEmail(content);

  assert.ok(full.html.includes('Full refund'));
  assert.ok(full.text.includes('Full refund: $45.50'));
});

test('omits a carrier link for unsupported carriers while keeping the supplied tracking details', () => {
  const content = sampleContent('order.shipped');
  content.carrier = '<unknown carrier>';

  const rendered = renderNotificationEmail(content);

  assert.ok(rendered.html.includes('&lt;unknown carrier&gt;'));
  assert.ok(!rendered.html.includes('Track your shipment'));
});
