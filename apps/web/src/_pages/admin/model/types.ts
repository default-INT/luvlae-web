import type { ProductOffer } from '@/entities/product';
import type { Dictionary } from '@/shared/config/i18n';

export type AdminCopy = Dictionary['admin'];
export interface PageResult<T> { items: T[]; nextCursor: string | null }
export interface AdminProduct extends ProductOffer {
  inventory: { stockQuantity: number; reservedQuantity: number }; updatedAt: string;
}
export interface AdminOrder {
  id: string; orderNumber: string; version: number; createdAt: string; updatedAt?: string;
  orderStatus: string; paymentStatus: string; fulfillmentStatus: string;
  pricing: { subtotal: number; discount: number; shipping: number | null; tax: number | null; total: number | null };
  reconciliationRequired: boolean; disputed: boolean;
}
export interface OrderDetail extends AdminOrder {
  items: { sku: string; name: string; quantity: number; unitAmount: number; lineSubtotal: number }[];
  customer?: { name: string; email: string; phone?: string };
  shippingAddress?: { recipientName: string; line1: string; line2?: string; city: string;
    state: string; postalCode: string; country: string };
  fulfillment: { status: string; carrier?: string; trackingNumber?: string };
  cancellation?: { reason: string; cancelledAt: string };
  restockedQuantities: Record<string, number>;
}
export type Filters = Record<string, string>;
export const orderStatuses = ['open', 'completed', 'cancelled'];
export const paymentStatuses = ['pending', 'processing', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'];
export const fulfillmentStatuses = ['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'];
export const dateTime = (value: string) => new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
}).format(new Date(value));

export const priceInCents = (value: string) => {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const [whole, fraction = ''] = value.split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
};
