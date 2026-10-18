import 'server-only';

import type { Db } from 'mongodb';
import type {
  AdminSession, AdminUser, AuditEntry, CheckoutAttempt, Order, PaymentEvent, PaymentTransaction, Product,
} from './models';

export const collections = (db: Db) => ({
  products: db.collection<Product>('products'),
  orders: db.collection<Order>('orders'),
  attempts: db.collection<CheckoutAttempt>('checkoutAttempts'),
  events: db.collection<PaymentEvent>('paymentEvents'),
  transactions: db.collection<PaymentTransaction>('paymentTransactions'),
  users: db.collection<AdminUser>('adminUsers'),
  sessions: db.collection<AdminSession>('adminSessions'),
  audit: db.collection<AuditEntry>('auditLog'),
});
