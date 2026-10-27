import type { GuestOrder } from './order';
import type { EcommerceParameters } from '@/shared/lib/analytics';

export const getOrderItemsAnalytics = (items: GuestOrder['items'], currency: 'USD', subtotal: number): EcommerceParameters => ({
  currency, value: subtotal / 100,
  items: items.map(item => ({
    item_id: item.sku, item_name: item.name, price: item.unitAmount / 100, quantity: item.quantity,
  })),
});

export const getPurchaseAnalytics = (order: GuestOrder): EcommerceParameters | null => {
  if (!order.analyticsPurchaseEligible || order.checkoutMode !== 'stripe' || order.paymentStatus !== 'paid'
    || order.pricing.total === null) return null;

  return { ...getOrderItemsAnalytics(order.items, order.currency, order.pricing.subtotal), transaction_id: order.orderNumber };
};
