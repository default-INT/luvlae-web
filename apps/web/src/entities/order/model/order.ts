export interface GuestOrder {
  orderNumber: string; orderStatus: string; checkoutMode: 'mock' | 'stripe';
  currency: 'USD'; paymentStatus: string; fulfillmentStatus: string;
  pricing: { subtotal: number; total: number | null };
  items: { sku: string; name: string; quantity: number; unitAmount: number; lineSubtotal: number }[];
}

export interface GuestCheckout {
  id: string;
  status: 'open' | 'complete' | 'expired';
  paymentStatus: string;
  publishableKey: string;
  clientSecret: string | null;
  expiresAt: string;
}
