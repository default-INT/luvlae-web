import 'server-only';

import { ObjectId } from 'mongodb';

import { hashToken } from '@/shared/lib/security/index.server';
import { withDatabase } from '@/shared/lib/mongodb/index.server';

import type { GuestOrder } from '../model/order';
import type { Db } from 'mongodb';

export const guestOrderCookieName = 'luvlae-order-access';

export const guestOrderCookie = (id: string, token: string, url: string) => {
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid order access.');
  const secure = new URL(url).protocol === 'https:' ? '; Secure' : '';
  return `${guestOrderCookieName}=${token}; Path=/orders/${id}; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
};

interface OrderDocument {
  _id: ObjectId; orderNumber: string; orderStatus: string; checkoutMode?: GuestOrder['checkoutMode'];
  currency: 'USD'; pricing: GuestOrder['pricing']; items: GuestOrder['items'];
  guestAccess: { tokenHash: string; expiresAt: Date };
  payment: { status: string }; fulfillment: { status: string };
}

export const findGuestOrder = async (db: Db, id: string, token: string): Promise<GuestOrder | null> => {
  if (!/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;

  const order = await db.collection<OrderDocument>('orders').findOne({
    _id: new ObjectId(id), 'guestAccess.tokenHash': hashToken(token), 'guestAccess.expiresAt': { $gt: new Date() },
  });

  if (!order) return null;
  return {
    orderNumber: order.orderNumber, orderStatus: order.orderStatus,
    checkoutMode: order.checkoutMode ?? 'stripe', currency: order.currency,
    pricing: { subtotal: order.pricing.subtotal, total: order.pricing.total },
    items: order.items.map(item => ({ sku: item.sku, name: item.name, quantity: item.quantity,
      unitAmount: item.unitAmount, lineSubtotal: item.lineSubtotal })),
    paymentStatus: order.payment.status, fulfillmentStatus: order.fulfillment.status,
  };
};

export const getGuestOrder = (id: string, token?: string): Promise<GuestOrder | null> => {
  if (!token || !/^[a-f0-9]{24}$/.test(id) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return Promise.resolve(null);
  return withDatabase(({ db }) => findGuestOrder(db, id, token));
};
