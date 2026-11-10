import type { ObjectId } from 'mongodb';
import type Stripe from 'stripe';
import type { ShippingAddress } from '@/entities/order';

export interface Product {
  _id: ObjectId;
  schemaVersion: number;
  sku: string;
  name: string;
  shortDescription: string;
  price: { currency: 'USD'; unitAmount: number };
  inventory: { stockQuantity: number; reservedQuantity: number; version?: number };
  offers?: ProductOfferRecord[];
  storefront?: ProductStorefront;
  salesEnabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: ObjectId;
}

export interface ProductOfferRecord {
  id: string;
  unitsPerPack: number;
  price: { currency: 'USD'; unitAmount: number };
  status: 'draft' | 'active' | 'archived';
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductStorefront {
  homeOfferIds: string[];
  highlightedOfferId: string | null;
  highlightBadge: 'bestValue' | 'recommended';
}

export interface PricingPolicy {
  shipping: string;
  tax: string;
  discount: string;
  catalog?: 'packs-v1';
}

export interface Order {
  checkoutMode?: 'mock' | 'stripe';
  _id: ObjectId;
  schemaVersion: number;
  version: number;
  orderNumber: string;
  creationKeyHash: string;
  creationRequestHash: string;
  guestAccess: { tokenHash: string; expiresAt: Date };
  items: {
    productId: ObjectId; sku: string; name: string; quantity: number;
    unitAmount: number; lineSubtotal: number; productVersion: number;
    offerId?: string; unitsPerPack?: number; inventoryQuantity?: number;
  }[];
  currency: 'USD';
  pricing: {
    state: 'estimated' | 'final'; includedTax?: number; subtotal: number; discount: number;
    shipping: number | null; tax: number | null; total: number | null;
  };
  pricingPolicy: PricingPolicy;
  salesTerms?: { policyVersion: string; effectiveAt: Date };
  customer?: { email: string; name: string; phone?: string };
  shippingPolicy?: 'contiguous-us-v1';
  shippingAddress?: {
    recipientName: string; line1: string; line2?: string; city: string;
    state: string; postalCode: string; country: 'US';
  };
  orderStatus: 'open' | 'completed' | 'cancelled';
  payment: {
    status: 'pending' | 'processing' | 'paid' | 'failed' | 'expired' | 'partially_refunded' | 'refunded';
    activeAttemptId?: ObjectId; settledAttemptId?: ObjectId;
    amountPaid: number; amountRefunded: number; paidAt?: Date; disputed: boolean; reconciliationRequired: boolean;
  };
  fulfillment: {
    status: 'unfulfilled' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
    carrier?: string; trackingNumber?: string; processingAt?: Date; shippedAt?: Date; deliveredAt?: Date;
  };
  cancellation?: { reason: string; cancelledAt: Date; cancelledBy: ObjectId };
  cancellationRequest?: { status: 'pending' | 'succeeded'; reason: string; operationId: string; adminId: ObjectId };
  restockedQuantities: Record<string, number>;
  notifications: { key: string; type: string; status: 'pending' | 'sent'; attempts: number; nextAttemptAt: Date }[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface CheckoutAttempt {
  _id: ObjectId; schemaVersion: number; orderId: ObjectId;
  requestKeyHash: string; requestHash: string; stripeIdempotencyKey: string;
  state: 'creating' | 'open' | 'processing' | 'succeeded' | 'failed' | 'expired' | 'cancelled';
  active: boolean;
  quoteSnapshot: {
    items: Order['items']; currency: 'USD'; pricing: Order['pricing']; pricingPolicy: Order['pricingPolicy'];
  };
  inventoryReservation: {
    state: 'held' | 'committed' | 'released'; items: { productId: ObjectId; quantity: number }[];
    expiresAt: Date; committedAt?: Date; releasedAt?: Date;
  };
  shippingSnapshot?: ShippingAddress;
  customerProvision?: {
    state: 'pending' | 'ready'; idempotencyKey: string; apiVersion: string;
    parameters: Stripe.CustomerCreateParams; customerId?: string; createdAt: Date;
  };
  stripeSessionId?: string; stripePaymentIntentId?: string; livemode: boolean;
  stripeRequest?: { apiVersion: string; parameters: Stripe.Checkout.SessionCreateParams };
  createdAt: Date; updatedAt: Date;
}

export interface PaymentEvent {
  _id: ObjectId; schemaVersion: number; provider: 'stripe'; eventId: string; eventType: string;
  providerObjectId: string; livemode: boolean; orderId?: ObjectId; attemptId?: ObjectId;
  providerCreatedAt: Date; receivedAt: Date;
  status: 'pending' | 'processing' | 'processed' | 'ignored' | 'failed';
  processingAttempts: number; nextAttemptAt: Date; leaseUntil?: Date; leaseToken?: string;
  processedAt?: Date; lastErrorCode?: string;
}

// Immutable financial observations; not a double-entry accounting ledger and not raw provider payloads.
export interface PaymentTransaction {
  _id: ObjectId; schemaVersion: number; operationId: string; orderId: ObjectId; attemptId: ObjectId;
  provider: 'stripe'; providerObjectId: string; providerEventId: string;
  type: 'payment' | 'refund' | 'dispute'; status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amount: number; currency: 'USD'; livemode: boolean;
  occurredAt: Date; recordedAt: Date;
}

export interface AdminUser {
  _id: ObjectId; schemaVersion: number; email: string; emailNormalized: string; passwordHash: string;
  notify: { orders: boolean };
  status: 'active' | 'disabled'; sessionVersion: number; passwordChangedAt: Date;
  lastLoginAt?: Date; createdAt: Date; updatedAt: Date;
}

export interface AdminSession {
  _id: ObjectId; schemaVersion: number; adminUserId: ObjectId; tokenHash: string;
  sessionVersion: number; createdAt: Date; expiresAt: Date; revokedAt?: Date;
}

export interface AuditEntry {
  _id: ObjectId; schemaVersion: number; operationId: string; requestHash: string;
  actor: { type: 'admin' | 'system' | 'stripe'; id?: ObjectId };
  entityType: 'product' | 'order' | 'checkoutAttempt'; entityId: ObjectId; action: string;
  changes: Record<string, unknown>; reason?: string; createdAt: Date;
}

export interface Refund {
  _id: ObjectId; schemaVersion: number; orderId: ObjectId; attemptId?: ObjectId;
  operationId: string; requestHash: string; requestedVersion: number;
  source: 'admin' | 'stripe' | 'mock'; kind: 'cancel' | 'refund';
  amount: number; currency: 'USD';
  status: 'requested' | 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  active: boolean; reason?: string; providerReason?: string; failureReason?: string;
  adminId?: ObjectId; providerRefundId?: string; stripePaymentIntentId?: string;
  providerRequestStartedAt?: Date; stripeApiVersion?: string; providerStatus?: string; leaseToken?: string; leaseUntil?: Date;
  livemode: boolean; createdAt: Date; updatedAt: Date;
}
