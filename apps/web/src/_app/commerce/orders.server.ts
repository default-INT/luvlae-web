import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { inTransaction } from '@/shared/lib/mongodb/index.server';

import { appendAudit, checkReplay, requestFingerprint } from './audit.server';
import { collections } from './collections.server';

import type { z } from 'zod';
import type { cancellationSchema, fulfillmentSchema, restockSchema } from './contracts';
import type { Order } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export const orderSummaryDto = (order: Order) => ({
  checkoutMode: order.checkoutMode ?? 'stripe',
  id: order._id.toHexString(), orderNumber: order.orderNumber, version: order.version,
  orderStatus: order.orderStatus, paymentStatus: order.payment.status, fulfillmentStatus: order.fulfillment.status,
  currency: order.currency, pricing: order.pricing, createdAt: order.createdAt.toISOString(),
  reconciliationRequired: order.payment.reconciliationRequired, disputed: order.payment.disputed,
});

export const orderDetailDto = (order: Order) => ({
  ...orderSummaryDto(order),
  items: order.items.map(({ productId, ...item }) => ({ ...item, productId: productId.toHexString() })),
  customer: order.customer, shippingAddress: order.shippingAddress, fulfillment: order.fulfillment,
  payment: {
    status: order.payment.status, amountPaid: order.payment.amountPaid, amountRefunded: order.payment.amountRefunded,
    paidAt: order.payment.paidAt,
  },
  cancellation: order.cancellation ? {
    reason: order.cancellation.reason, cancelledAt: order.cancellation.cancelledAt,
  } : undefined,
  restockedQuantities: order.restockedQuantities, updatedAt: order.updatedAt.toISOString(),
});

export const updateFulfillment = async (
  context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: z.infer<typeof fulfillmentSchema>,
) => inTransaction(context, async session => {
  const { orders } = collections(context.db);

  const requestHash = requestFingerprint({
    action: 'order.fulfillment', actor: adminId.toHexString(), id: orderId.toHexString(), input,
  });

  const replay = await checkReplay(context.db, session, input.operationId, requestHash);
  if (replay) return { id: orderId.toHexString(), replayed: true };
  const order = await orders.findOne({ _id: orderId }, { session });
  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');
  if (order.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the order before editing.');
  if (order.orderStatus !== 'open' || order.payment.status !== 'paid'
    || order.payment.disputed || order.payment.reconciliationRequired || !order.shippingAddress || !order.customer) {
    fail(409, 'FULFILLMENT_BLOCKED', 'The order is not eligible for fulfillment.');
  }
  const next: Record<string, string> = { unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered' };
  if (next[order.fulfillment.status] !== input.status) fail(409, 'INVALID_TRANSITION', 'Invalid fulfillment transition.');
  if (input.status === 'shipped' && (!input.carrier || !input.trackingNumber)) {
    fail(400, 'TRACKING_REQUIRED', 'Carrier and tracking number are required.');
  }
  if (input.status !== 'shipped' && (input.carrier || input.trackingNumber)) {
    fail(400, 'INVALID_INPUT', 'Tracking fields are accepted only for shipment.');
  }
  const now = new Date();

  const fulfillment = {
    ...order.fulfillment, status: input.status,
    ...(input.status === 'processing' ? { processingAt: now } : {}),
    ...(input.status === 'shipped' ? { shippedAt: now, carrier: input.carrier, trackingNumber: input.trackingNumber } : {}),
    ...(input.status === 'delivered' ? { deliveredAt: now } : {}),
  };

  const result = await orders.updateOne({ _id: orderId, version: input.version }, {
    $set: {
      fulfillment, updatedAt: now,
      ...(input.status === 'delivered' ? { orderStatus: 'completed' as const, completedAt: now } : {}),
    },
    $inc: { version: 1 },
    ...(input.status === 'shipped' ? { $push: { notifications: {
      key: 'shipping', type: 'shipping', status: 'pending' as const, attempts: 0, nextAttemptAt: now,
    } } } : {}),
  }, { session });

  if (!result.modifiedCount) fail(409, 'VERSION_CONFLICT', 'Reload the order before editing.');
  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'order', entityId: orderId, action: 'order.fulfillment',
    changes: { before: order.fulfillment, after: fulfillment },
  });
  return { id: orderId.toHexString(), replayed: false };
});

export const cancelOrder = async (
  context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: z.infer<typeof cancellationSchema>,
) => inTransaction(context, async session => {
  const { orders } = collections(context.db);

  const requestHash = requestFingerprint({
    action: 'order.cancel', actor: adminId.toHexString(), id: orderId.toHexString(), input,
  });

  if (await checkReplay(context.db, session, input.operationId, requestHash)) {
    return { id: orderId.toHexString(), replayed: true };
  }
  const order = await orders.findOne({ _id: orderId }, { session });
  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');
  if (order.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the order before editing.');
  if (order.orderStatus !== 'open') fail(409, 'INVALID_TRANSITION', 'Only open orders can be cancelled.');
  // A provider session must be expired/reconciled by the future Stripe adapter before cancellation.
  if (order.payment.activeAttemptId || order.payment.status === 'processing' || order.payment.reconciliationRequired) {
    fail(409, 'PAYMENT_RECONCILIATION_REQUIRED', 'Resolve the active payment before cancellation.');
  }
  const now = new Date();

  const fulfillment = ['shipped', 'delivered'].includes(order.fulfillment.status)
    ? order.fulfillment : { ...order.fulfillment, status: 'cancelled' as const };

  await orders.updateOne({ _id: orderId, version: input.version }, {
    $set: {
      orderStatus: 'cancelled', fulfillment, updatedAt: now,
      cancellation: { reason: input.reason, cancelledAt: now, cancelledBy: adminId },
    },
    $inc: { version: 1 },
  }, { session });
  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'order', entityId: orderId, action: 'order.cancel', reason: input.reason,
    changes: { before: { orderStatus: order.orderStatus }, after: { orderStatus: 'cancelled' } },
  });
  return { id: orderId.toHexString(), replayed: false };
});

export const restockOrder = async (
  context: DatabaseContext, adminId: ObjectId, orderId: ObjectId, input: z.infer<typeof restockSchema>,
) => inTransaction(context, async session => {
  const { orders, products } = collections(context.db);

  const requestHash = requestFingerprint({
    action: 'order.restock', actor: adminId.toHexString(), id: orderId.toHexString(), input,
  });

  if (await checkReplay(context.db, session, input.operationId, requestHash)) {
    return { id: orderId.toHexString(), replayed: true };
  }
  const order = await orders.findOne({ _id: orderId }, { session });
  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');
  if (order.version !== input.version) fail(409, 'VERSION_CONFLICT', 'Reload the order before editing.');
  if (!order.payment.settledAttemptId || order.payment.activeAttemptId || order.payment.reconciliationRequired
    || order.payment.disputed) fail(409, 'RESTOCK_BLOCKED', 'The payment must be settled and reconciled before restocking.');
  const shipped = ['shipped', 'delivered'].includes(order.fulfillment.status);
  if ((shipped && !input.returnedAndSellable) || (!shipped && order.orderStatus !== 'cancelled')) {
    fail(409, 'RESTOCK_BLOCKED', 'Cancel an unshipped order or confirm returned sellable goods.');
  }
  const restocked = { ...order.restockedQuantities };
  for (const item of input.items) {
    const purchased = order.items.find(value => value.sku === item.sku);
    if (!purchased) return fail(409, 'RESTOCK_LIMIT', 'The item does not belong to this order.');
    if ((restocked[item.sku] ?? 0) + item.quantity > purchased.quantity) {
      fail(409, 'RESTOCK_LIMIT', 'Restocking exceeds the purchased quantity.');
    }

    const result = await products.updateOne({ _id: purchased.productId }, {
      $inc: { 'inventory.stockQuantity': item.quantity, version: 1 }, $set: { updatedAt: new Date(), updatedBy: adminId },
    }, { session });

    if (!result.modifiedCount) fail(409, 'PRODUCT_UNAVAILABLE', 'The referenced product does not exist.');
    restocked[item.sku] = (restocked[item.sku] ?? 0) + item.quantity;
  }
  await orders.updateOne({ _id: orderId, version: input.version }, {
    $set: { restockedQuantities: restocked, updatedAt: new Date() }, $inc: { version: 1 },
  }, { session });
  await appendAudit(context.db, session, {
    operationId: input.operationId, requestHash, actor: { type: 'admin', id: adminId },
    entityType: 'order', entityId: orderId, action: 'order.restock', reason: input.reason,
    changes: { items: input.items, returnedAndSellable: input.returnedAndSellable },
  });
  return { id: orderId.toHexString(), replayed: false };
});
