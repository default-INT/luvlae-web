import { z } from 'zod';

export const skuSchema = z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,63}$/);
export const idSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const integerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const versionSchema = integerSchema.min(1);
export const operationSchema = z.string().uuid();
export const paymentStatuses = ['pending', 'processing', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded'] as const;
export const fulfillmentStatuses = ['unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled'] as const;

const productFields = {
  name: z.string().trim().min(1).max(200),
  shortDescription: z.string().trim().max(2000),
  unitAmount: integerSchema.min(1),
  stockQuantity: integerSchema,
  salesEnabled: z.boolean(),
};

export const createProductSchema = z.strictObject({
  sku: skuSchema,
  ...productFields,
  salesEnabled: productFields.salesEnabled.default(false),
  operationId: operationSchema,
});

export const updateProductSchema = z.strictObject({
  ...z.object(productFields).partial().shape,
  version: versionSchema,
  operationId: operationSchema,
  reason: z.string().trim().min(1).max(500),
}).refine(value => Object.keys(productFields).some(key => key in value));

export const loginSchema = z.strictObject({
  email: z.email().max(254).transform(value => value.trim().toLowerCase()),
  password: z.string().min(1).max(256),
});

export const quoteSchema = z.strictObject({
  items: z.array(z.strictObject({ sku: skuSchema, quantity: integerSchema.min(1).max(99) })).min(1).max(20),
}).refine(value => new Set(value.items.map(item => item.sku)).size === value.items.length);

export const fulfillmentSchema = z.strictObject({
  version: versionSchema,
  operationId: operationSchema,
  status: z.enum(['processing', 'shipped', 'delivered']),
  carrier: z.string().trim().min(1).max(100).optional(),
  trackingNumber: z.string().trim().min(1).max(200).optional(),
});

export const cancellationSchema = z.strictObject({
  version: versionSchema,
  operationId: operationSchema,
  reason: z.string().trim().min(1).max(500),
});

export const restockSchema = z.strictObject({
  version: versionSchema,
  operationId: operationSchema,
  reason: z.string().trim().min(1).max(500),
  returnedAndSellable: z.boolean(),
  items: z.array(z.strictObject({ sku: skuSchema, quantity: integerSchema.min(1).max(99) })).min(1).max(20),
}).refine(value => new Set(value.items.map(item => item.sku)).size === value.items.length);
