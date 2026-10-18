import 'server-only';

import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import {
  currentAdmin, getAdminOrder, getAdminProduct, listOrders, listProducts,
} from '../commerce/handlers.server';

import type { RouteParams } from '../commerce/handlers.server';
import type { AdminOrder, AdminProduct, OrderDetail, PageResult } from '@/_pages/admin';

const query = async <T>(
  handler: (request: Request, route: RouteParams) => Promise<Response>, path: string, params: Record<string, string> = {},
): Promise<T> => {
  const response = await handler(new Request(`https://luvlae.local/api/admin${path}`, {
    headers: { cookie: (await cookies()).toString() },
  }), { params: Promise.resolve(params) });

  if (response.status === 401) redirect('/admin/login');
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error('The admin data could not be loaded.');
  const result = await response.json() as { data: T };
  return result.data;
};

export const adminSession = () => query<{ email: string }>(currentAdmin, '/auth/me');
export const adminOrders = (search: string) => query<PageResult<AdminOrder>>(listOrders, `/orders?${search}`);
export const adminOrder = (id: string) => query<OrderDetail>(getAdminOrder, `/orders/${id}`, { id });
export const adminProducts = (search = '') => query<PageResult<AdminProduct>>(listProducts, `/products?${search}`);
export const adminProduct = (sku: string) => query<AdminProduct>(getAdminProduct, `/products/${sku}`, { sku });
