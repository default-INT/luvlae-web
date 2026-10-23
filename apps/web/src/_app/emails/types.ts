export type NotificationEvent =
  | 'order.paid'
  | 'admin.order-paid'
  | 'order.processing'
  | 'order.shipped'
  | 'order.delivered'
  | 'order.cancelled'
  | 'refund.succeeded';

export interface NotificationItem {
  name: string;
  quantity: number;
  unitAmount: number;
  lineSubtotal: number;
}

export interface NotificationContent {
  type: NotificationEvent;
  orderNumber: string;
  customerName?: string;
  items: NotificationItem[];
  currency: 'USD';
  total?: number;
  amountPaid?: number;
  requiresReview?: boolean;
  carrier?: string;
  trackingNumber?: string;
  refundAmount?: number;
  adminUrl?: string;
  supportEmail?: string;
}

export interface RenderedNotificationEmail {
  subject: string;
  html: string;
  text: string;
}
