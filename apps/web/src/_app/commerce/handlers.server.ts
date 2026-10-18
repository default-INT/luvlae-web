import 'server-only';

import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { fail, handle, json, readJson, requireOrigin } from '@/shared/lib/api/index.server';
import { withDatabase } from '@/shared/lib/mongodb/index.server';
import { findGuestOrder, guestOrderCookie } from '@/entities/order/index.server';

import { login, logout, requireAdmin, requireSessionCookie, sessionCookie } from './auth.server';
import { collections } from './collections.server';
import {
  cancellationSchema, createProductSchema, fulfillmentSchema, fulfillmentStatuses, idSchema,
  loginSchema, paymentStatuses, quoteSchema, restockSchema, skuSchema, updateProductSchema,
} from './contracts';
import { createMockOrder, mockCheckoutSchema, requireMockCheckout } from './mock-checkout.server';
import { cancelOrder, orderDetailDto, orderSummaryDto, restockOrder, updateFulfillment } from './orders.server';
import { readPage } from './pagination.server';
import { calculateQuote, createProduct, productDto, updateProduct } from './products.server';

import type { Document } from 'mongodb';
import type { Order, PaymentTransaction, Product } from './models';
import type { DatabaseContext } from '@/shared/lib/mongodb/index.server';

export interface RouteParams { params: Promise<Record<string, string>> }

const admin = (request: Request, operation: (context: DatabaseContext, adminId: ObjectId) => Promise<Response>) =>
  handle(async () => {
    if (!['GET', 'HEAD'].includes(request.method)) requireOrigin(request);
    requireSessionCookie(request);
    return withDatabase(async context => {
      const user = await requireAdmin(context.db, request);
      return operation(context, user._id);
    });
  })();

export const getProduct = (request: Request, route: RouteParams) => handle(async () => {
  const sku = skuSchema.parse((await route.params).sku);
  return withDatabase(async ({ db }) => {
    const product = await collections(db).products.findOne({ sku });
    if (!product || !product.salesEnabled) return fail(404, 'NOT_FOUND', 'Product not found.');
    return json(productDto(product));
  });
})();

export const quote = (request: Request) => handle(async () => {
  requireOrigin(request);
  const input = await readJson(request, quoteSchema);
  return withDatabase(async context => json(await calculateQuote(context, input)));
})();

export const signIn = (request: Request) => handle(async () => {
  requireOrigin(request);
  const input = await readJson(request, loginSchema);
  return withDatabase(async ({ db }) => {
    const result = await login(db, input.email, input.password, request);
    return json(result.user, 200, { 'Set-Cookie': sessionCookie(result.token, request) });
  });
})();

export const signOut = (request: Request) => admin(request, async ({ db }) => {
  await logout(db, request);
  return json({ signedOut: true }, 200, { 'Set-Cookie': sessionCookie('', request, true) });
});

export const currentAdmin = (request: Request) => admin(request, async ({ db }) => {
  const user = await requireAdmin(db, request);
  return json({ id: user._id.toHexString(), email: user.email });
});

export const listProducts = (request: Request) => admin(request, async ({ db }) => {
  const page = await readPage(db.collection('products'), request, 'createdAt', {});
  return json({ ...page, items: page.items.map(item => productDto(item as Product, true)) });
});

export const postProduct = (request: Request) => admin(request, async (context, adminId) => {
  const input = await readJson(request, createProductSchema);
  const result = await createProduct(context, adminId, input);
  return json(result, result.replayed ? 200 : 201);
});

export const getAdminProduct = (request: Request, route: RouteParams) => admin(request, async ({ db }) => {
  const sku = skuSchema.parse((await route.params).sku);
  const product = await collections(db).products.findOne({ sku });
  if (!product) return fail(404, 'NOT_FOUND', 'Product not found.');
  return json(productDto(product, true));
});

export const patchProduct = (request: Request, route: RouteParams) => admin(request, async (context, adminId) => {
  const sku = skuSchema.parse((await route.params).sku);
  const input = await readJson(request, updateProductSchema);
  return json(await updateProduct(context, adminId, sku, input));
});

export const listOrders = (request: Request) => admin(request, async ({ db }) => {
  const params = new URL(request.url).searchParams;
  const filter: Document = {};
  if (params.has('orderStatus')) filter.orderStatus = z.enum(['open', 'completed', 'cancelled']).parse(params.get('orderStatus'));
  if (params.has('paymentStatus')) filter['payment.status'] = z.enum(paymentStatuses).parse(params.get('paymentStatus'));
  if (params.has('fulfillmentStatus')) {
    filter['fulfillment.status'] = z.enum(fulfillmentStatuses).parse(params.get('fulfillmentStatus'));
  }
  const page = await readPage(db.collection('orders'), request, 'createdAt', filter);
  return json({ ...page, items: page.items.map(item => orderSummaryDto(item as Order)) });
});

export const getAdminOrder = (request: Request, route: RouteParams) => admin(request, async ({ db }) => {
  const id = idSchema.parse((await route.params).id);
  const order = await collections(db).orders.findOne({ _id: new ObjectId(id) });
  if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');
  return json(orderDetailDto(order));
});

export const patchFulfillment = (request: Request, route: RouteParams) => admin(request, async (context, adminId) => {
  const id = new ObjectId(idSchema.parse((await route.params).id));
  const input = await readJson(request, fulfillmentSchema);
  return json(await updateFulfillment(context, adminId, id, input));
});

export const postCancellation = (request: Request, route: RouteParams) => admin(request, async (context, adminId) => {
  const id = new ObjectId(idSchema.parse((await route.params).id));
  const input = await readJson(request, cancellationSchema);
  return json(await cancelOrder(context, adminId, id, input));
});

export const postRestock = (request: Request, route: RouteParams) => admin(request, async (context, adminId) => {
  const id = new ObjectId(idSchema.parse((await route.params).id));
  const input = await readJson(request, restockSchema);
  return json(await restockOrder(context, adminId, id, input));
});

export const listTransactions = (request: Request) => admin(request, async ({ db }) => {
  const params = new URL(request.url).searchParams;
  const filter: Document = {};
  if (params.has('orderId')) filter.orderId = new ObjectId(idSchema.parse(params.get('orderId')));
  if (params.has('type')) filter.type = z.enum(['payment', 'refund', 'dispute']).parse(params.get('type'));
  if (params.has('status')) filter.status = z.enum(['pending', 'succeeded', 'failed', 'cancelled']).parse(params.get('status'));
  const page = await readPage(db.collection('paymentTransactions'), request, 'recordedAt', filter);
  return json({ ...page, items: page.items.map(item => {
    const value = item as PaymentTransaction;
    return {
      id: value._id.toHexString(), orderId: value.orderId.toHexString(), attemptId: value.attemptId.toHexString(),
      provider: value.provider, providerObjectId: value.providerObjectId, type: value.type, status: value.status,
      amount: value.amount, currency: value.currency, livemode: value.livemode,
      occurredAt: value.occurredAt.toISOString(), recordedAt: value.recordedAt.toISOString(),
    };
  }) });
});

export const guestOrderStatus = (request: Request, route: RouteParams) => handle(async () => {
  const id = idSchema.parse((await route.params).id);
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
    return fail(404, 'NOT_FOUND', 'Order not found.');
  }
  return withDatabase(async ({ db }) => {
    const order = await findGuestOrder(db, id, authorization.slice(7));
    if (!order) return fail(404, 'NOT_FOUND', 'Order not found.');
    return json(order);
  });
})();

export const checkoutUnavailable = (request: Request) => handle(async () => {
  requireOrigin(request);
  return fail(503, 'CHECKOUT_NOT_CONFIGURED', 'Checkout requires configured Stripe, shipping, and tax policies.');
})();

export const stripeUnavailable = () => handle(async () =>
  fail(503, 'PAYMENTS_NOT_CONFIGURED', 'Stripe signature verification and event processing are not configured.'))();

export const mockCheckout = (request: Request) => handle(async () => {
  requireOrigin(request);
  requireMockCheckout();
  const input = await readJson(request, mockCheckoutSchema);
  return withDatabase(async context => {
    const result = await createMockOrder(context, input);
    return json(result, result.replayed ? 200 : 201, {
      'Set-Cookie': guestOrderCookie(result.id, input.guestToken, request.url),
    });
  });
})();

// Upgrade links created before SSR order pages without exposing order details to browser JavaScript.
export const restoreGuestAccess = (request: Request, route: RouteParams) => handle(async () => {
  requireOrigin(request);
  const id = idSchema.parse((await route.params).id);
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
    return fail(404, 'NOT_FOUND', 'Order not found.');
  }
  await readJson(request, z.strictObject({}));
  return withDatabase(async ({ db }) => {
    const token = authorization.slice(7);
    if (!await findGuestOrder(db, id, token)) return fail(404, 'NOT_FOUND', 'Order not found.');
    return json({ authenticated: true }, 200, { 'Set-Cookie': guestOrderCookie(id, token, request.url) });
  });
})();
