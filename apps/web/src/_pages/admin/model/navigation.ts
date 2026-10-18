export const orderFilterKeys = ['q', 'orderStatus', 'paymentStatus', 'fulfillmentStatus', 'from', 'to', 'cursor'];

export const readOrderFilters = (params: Pick<URLSearchParams, 'get'>): Record<string, string> => {
  const filters: Record<string, string> = {};
  for (const key of orderFilterKeys) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return filters;
};

export const ordersUrl = (filters: Record<string, string>, orderId?: string | null) => {
  const params = new URLSearchParams(filters);
  if (orderId) params.set('order', orderId);
  else params.delete('order');
  const search = params.toString();
  return `/admin/orders${search ? `?${search}` : ''}`;
};

export const orderSelection = (params: Pick<URLSearchParams, 'get'>) => {
  const id = params.get('order');
  return id && /^[a-f0-9]{24}$/.test(id) ? id : null;
};
