import type { NotificationContent, NotificationEvent, RenderedNotificationEmail } from './types';

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const cleanText = (value?: string) => (value || '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const formatAmount = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
}).format(Number.isFinite(amount) ? amount / 100 : 0);

const formatOrderNumber = (orderNumber: string) => cleanText(orderNumber) || 'your order';

const refundLabelFor = (content: NotificationContent) => {
  if (content.type !== 'refund.succeeded') return 'Refunded';

  if (content.refundAmount === undefined || typeof content.total !== 'number') return 'Refunded';

  if (content.refundAmount >= content.total) return 'Full refund';

  return 'Partial refund';
};

const eventCopy: Record<NotificationEvent, { subject: string; title: string; message: string }> = {
  'order.paid': {
    subject: 'Order confirmed',
    title: 'Your order is confirmed',
    message: 'We’ve received your payment and confirmed your order. We’ll send another update when it is being prepared.',
  },
  'admin.order-paid': {
    subject: 'New paid order',
    title: 'A new order has been paid',
    message: 'A customer payment was received. Review the order details in the admin area.',
  },
  'order.processing': {
    subject: 'Your order is being prepared',
    title: 'We’re preparing your order',
    message: 'Your order is now being prepared. We’ll send another update when it ships.',
  },
  'order.shipped': {
    subject: 'Your order has shipped',
    title: 'Your order is on its way',
    message: 'Your order has shipped. Use the tracking details below for carrier updates.',
  },
  'order.delivered': {
    subject: 'Your order was delivered',
    title: 'Your order was delivered',
    message: 'Your order has been marked as delivered. We hope everything arrived safely.',
  },
  'order.cancelled': {
    subject: 'Your order was cancelled',
    title: 'Your order was cancelled',
    message: 'The cancellation is complete. Any confirmed refund is shown below.',
  },
  'refund.succeeded': {
    subject: 'Your refund was processed',
    title: 'Your refund was processed',
    message: 'Your refund has been processed. Your bank or card provider controls when it appears on your statement.',
  },
};

const carrierTrackingUrl = (carrier: string, trackingNumber: string) => {
  const key = cleanText(carrier).toLowerCase().replace(/[^a-z]/g, '');
  const tracking = cleanText(trackingNumber);

  if (!tracking || !/^[a-z0-9 -]+$/i.test(tracking)) return undefined;

  const urls: Record<string, (number: string) => string> = {
    dhl: number => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${encodeURIComponent(number)}`,
    fedex: number => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(number)}`,
    ontrac: number => `https://www.ontrac.com/tracking/?number=${encodeURIComponent(number)}`,
    ups: number => `https://www.ups.com/track?tracknum=${encodeURIComponent(number)}`,
    usps: number => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(number)}`,
  };

  const makeUrl = urls[key];

  return makeUrl ? makeUrl(tracking) : undefined;
};

const safeAdminUrl = (value?: string) => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const localHostnames = ['localhost', '127.0.0.1'];
    const isLocalDevelopment = url.protocol === 'http:' && localHostnames.includes(url.hostname);

    if ((url.protocol !== 'https:' && !isLocalDevelopment) || url.username || url.password) return undefined;

    return url.toString();
  } catch {
    return undefined;
  }
};

const safeSupportEmail = (value?: string) => {
  if (!value) return undefined;

  const email = cleanText(value);

  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : undefined;
};

const renderItemsHtml = (content: NotificationContent) => content.items.map(item => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #d8dce9;color:#001a40;font-size:14px;line-height:20px;">
      ${escapeHtml(cleanText(item.name))}<br>
      <span style="color:#43474f;font-size:12px;">
        Qty ${Math.max(0, Math.floor(item.quantity))} · ${formatAmount(item.unitAmount)} each
      </span>
    </td>
    <td align="right" valign="top"
      style="padding:12px 0;border-bottom:1px solid #d8dce9;color:#001a40;font-size:14px;line-height:20px;white-space:nowrap;">
      ${formatAmount(item.lineSubtotal)}
    </td>
  </tr>`).join('');

const renderItemsText = (content: NotificationContent) => content.items.map(item => [
  `• ${cleanText(item.name)} — Qty ${Math.max(0, Math.floor(item.quantity))}`,
  `${formatAmount(item.unitAmount)} each · ${formatAmount(item.lineSubtotal)} total`,
].join(' ')).join('\n');

export const renderNotificationEmail = (content: NotificationContent): RenderedNotificationEmail => {
  const heldPayment = content.requiresReview && ['order.paid', 'admin.order-paid'].includes(content.type);

  const heldCopy = content.type === 'admin.order-paid' ? {
    subject: 'Paid order needs review', title: 'Payment received — review required',
    message: 'Payment was received, but this order has a hold. Review the order before preparing or shipping it.',
  } : {
    subject: 'Payment received', title: 'We’ve received your payment',
    message: 'We are reviewing your order. We’ll send another update when its status changes.',
  };

  const copy = heldPayment ? heldCopy : eventCopy[content.type];
  const orderNumber = formatOrderNumber(content.orderNumber);

  const greeting = content.type === 'admin.order-paid'
    ? 'Hello,'
    : `Hello ${cleanText(content.customerName) || 'there'},`;

  const totalLabel = content.type === 'refund.succeeded' ? 'Order total' : 'Total';

  const totalValue = typeof content.total === 'number' && Number.isSafeInteger(content.total)
    ? formatAmount(content.total) : 'Not finalized';

  const noPayment = content.type === 'order.cancelled' && content.amountPaid === 0
    ? 'No payment was collected for this order.' : '';

  const showRefund = (content.type === 'refund.succeeded' || content.type === 'order.cancelled')
    && content.refundAmount !== undefined;

  const refundLabel = refundLabelFor(content);

  const refundLine = showRefund && content.refundAmount !== undefined ? `
      <tr>
        <td style="padding-top:8px;color:#43474f;font-size:14px;">${refundLabel}</td>
        <td align="right" style="padding-top:8px;color:#14648d;font-size:14px;font-weight:700;">
          ${formatAmount(content.refundAmount)}
        </td>
      </tr>` : '';

  const showTracking = content.type === 'order.shipped' && content.carrier && content.trackingNumber;

  const trackingUrl = showTracking && content.carrier && content.trackingNumber
    ? carrierTrackingUrl(content.carrier, content.trackingNumber)
    : undefined;

  const trackingHtml = showTracking && content.carrier && content.trackingNumber
    ? `<p style="margin:0 0 8px;color:#43474f;font-size:14px;line-height:22px;">
        <strong style="color:#001a40;">Carrier:</strong> ${escapeHtml(cleanText(content.carrier))}<br>
        <strong style="color:#001a40;">Tracking number:</strong>
        ${escapeHtml(cleanText(content.trackingNumber))}
      </p>${trackingUrl ? `
      <p style="margin:0;">
        <a href="${escapeHtml(trackingUrl)}"
          style="color:#14648d;font-size:14px;font-weight:700;text-decoration:underline;">
          Track your shipment
        </a>
      </p>` : ''}`
    : '';

  const adminUrl = content.type === 'admin.order-paid' ? safeAdminUrl(content.adminUrl) : undefined;

  const adminCtaHtml = adminUrl
    ? `<p style="margin:24px 0 0;">
        <a href="${escapeHtml(adminUrl)}"
          style="display:inline-block;padding:13px 20px;border-radius:16px;background:#082f63;
          color:#ffffff;font-size:14px;font-weight:700;line-height:20px;text-decoration:none;">
          Review order
        </a>
      </p>`
    : '';

  const supportEmail = safeSupportEmail(content.supportEmail);

  const supportHtml = supportEmail
    ? `<a href="mailto:${escapeHtml(supportEmail)}"
        style="color:#14648d;text-decoration:underline;">${escapeHtml(supportEmail)}</a>`
    : 'Luvlae Customer Care';

  const detailsHtml = trackingHtml || adminCtaHtml
    ? `<tr><td style="padding:20px 28px 24px;">${trackingHtml}${adminCtaHtml}</td></tr>`
    : '';

  const refundText = showRefund && content.refundAmount !== undefined
    ? `\n${refundLabel}: ${formatAmount(content.refundAmount)}`
    : '';

  const trackingText = showTracking && content.carrier && content.trackingNumber
    ? [
      `Carrier: ${cleanText(content.carrier)}`,
      `Tracking number: ${cleanText(content.trackingNumber)}`,
      ...(trackingUrl ? [`Track shipment: ${trackingUrl}`] : []),
    ].join('\n')
    : '';

  const adminText = adminUrl ? `\nReview order: ${adminUrl}` : '';
  const supportText = supportEmail || 'Luvlae Customer Care';
  const subject = `${copy.subject} · ${orderNumber}`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f3fd;color:#43474f;
    font-family:Manrope,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${escapeHtml(copy.message)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="width:100%;background-color:#f1f3fd;">
      <tr><td align="center" style="padding:28px 14px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
          style="width:100%;max-width:600px;border:1px solid #d8dce9;border-radius:16px;
          background-color:#f9f9ff;overflow:hidden;">
          <tr><td style="padding:24px 28px;border-bottom:1px solid #d8dce9;">
            <span style="color:#001a40;font-family:Manrope,Arial,sans-serif;font-size:22px;
              font-weight:800;letter-spacing:2px;">LUVLAE<span style="color:#14648d;">.</span></span>
          </td></tr>
          <tr><td style="padding:30px 28px 20px;">
            <p style="margin:0 0 14px;color:#43474f;font-size:14px;line-height:22px;">
              ${escapeHtml(greeting)}
            </p>
            <h1 style="margin:0 0 10px;color:#001a40;font-family:Manrope,Arial,sans-serif;
              font-size:25px;font-weight:750;line-height:32px;">${escapeHtml(copy.title)}</h1>
            <p style="margin:0;color:#43474f;font-size:15px;line-height:24px;">
              ${escapeHtml(copy.message)}
            </p>
            <p style="margin:20px 0 0;color:#43474f;font-size:14px;line-height:20px;">
              <strong style="color:#001a40;">Order:</strong> ${escapeHtml(orderNumber)}
            </p>
          </td></tr>
          <tr><td style="padding:0 28px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
              style="width:100%;border:1px solid #d8dce9;border-radius:16px;
              background-color:#ffffff;padding:0 16px;">
              <tr><td colspan="2" style="padding:16px 0 8px;color:#082f63;font-size:12px;
                font-weight:700;letter-spacing:1px;text-transform:uppercase;">Order summary</td></tr>
              ${renderItemsHtml(content)}
              <tr>
                <td style="padding:16px 0 4px;color:#43474f;font-size:14px;font-weight:700;">
                  ${totalLabel}
                </td>
                <td align="right" style="padding:16px 0 4px;color:#001a40;font-size:16px;
                  font-weight:700;white-space:nowrap;">${totalValue}</td>
              </tr>
              ${refundLine}
              ${noPayment ? `<tr><td colspan="2" style="padding:12px 0;color:#43474f;font-size:14px;">
                ${noPayment}</td></tr>` : ''}
              <tr><td colspan="2" style="height:12px;"></td></tr>
            </table>
          </td></tr>
          ${detailsHtml}
          <tr><td style="padding:20px 28px 24px;border-top:1px solid #d8dce9;
            background-color:#f1f3fd;">
            <p style="margin:0 0 8px;color:#43474f;font-size:13px;line-height:20px;">
              Questions about your order? Contact ${supportHtml}.
            </p>
            <p style="margin:0;color:#43474f;font-size:12px;line-height:18px;">
              Luvlae<br>Order update for ${escapeHtml(orderNumber)}
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = [
    copy.title,
    '',
    greeting,
    copy.message,
    '',
    `Order: ${orderNumber}`,
    '',
    'Order summary:',
    renderItemsText(content),
    `${totalLabel}: ${totalValue}${refundText}${trackingText}${adminText}${noPayment ? `\n${noPayment}` : ''}`,
    '',
    `Questions about your order? Contact ${supportText}.`,
    '',
    'Luvlae',
  ].join('\n');

  return { subject, html, text };
};
