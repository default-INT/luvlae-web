import 'server-only';

import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';

import { fulfillmentStatuses, paymentStatuses } from './contracts';

import type { Document } from 'mongodb';

export const orderListFilter = (params: URLSearchParams): Document => {
  const filter: Document = {};
  const orderStatus = params.get('orderStatus');
  const paymentStatus = params.get('paymentStatus');
  const fulfillmentStatus = params.get('fulfillmentStatus');
  if (orderStatus) filter.orderStatus = z.enum(['open', 'completed', 'cancelled']).parse(orderStatus);
  if (paymentStatus) filter['payment.status'] = z.enum(paymentStatuses).parse(paymentStatus);
  if (fulfillmentStatus) filter['fulfillment.status'] = z.enum(fulfillmentStatuses).parse(fulfillmentStatus);
  const query = z.string().trim().max(100).parse(params.get('q') ?? '');
  if (query) filter.orderNumber = { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const from = params.get('from');
  const to = params.get('to');
  if (from) z.iso.date().parse(from);
  if (to) z.iso.date().parse(to);
  if (from && to && from > to) fail(400, 'INVALID_RANGE', 'The start date must be before the end date.');
  if (from || to) { filter.createdAt = {
    ...(from ? { $gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { $lt: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86400000) } : {}),
  }; }
  return filter;
};
