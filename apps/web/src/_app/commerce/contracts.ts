import { z } from 'zod';

import { shippingAddressSchema } from './shipping-address';

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

export const legacyCartItemSchema = z.strictObject({ sku: skuSchema, quantity: integerSchema.min(1).max(99) });
export const packCartItemSchema = legacyCartItemSchema.extend({ offerId: z.union([z.literal('standard'), z.uuid()]) });

const uniqueLines = (items: { sku: string; offerId?: string }[]) =>
  new Set(items.map(item => `${item.sku}:${item.offerId ?? 'standard'}`)).size === items.length;

export const legacyCartItemsSchema = z.array(legacyCartItemSchema).min(1).max(20).refine(uniqueLines);
export const packCartItemsSchema = z.array(packCartItemSchema).min(1).max(20).refine(uniqueLines);
export const legacyCheckoutItemsSchema = z.array(legacyCartItemSchema.extend({ productVersion: versionSchema }))
  .min(1).max(20).refine(uniqueLines);
export const packCheckoutItemsSchema = z.array(packCartItemSchema.extend({ productVersion: versionSchema }))
  .min(1).max(20).refine(uniqueLines);
export const checkoutRequestSchema = z.union([
  z.strictObject({ operationId: operationSchema, guestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    cartFormat: z.undefined().optional(), items: legacyCheckoutItemsSchema }),
  z.strictObject({ operationId: operationSchema, guestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    cartFormat: z.literal('packs-v1'), items: packCheckoutItemsSchema }),
  z.strictObject({ operationId: operationSchema, guestToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    cartFormat: z.literal('packs-v2'), items: packCheckoutItemsSchema, shippingAddress: shippingAddressSchema }),
]);
export const quoteSchema = z.union([
  z.strictObject({ cartFormat: z.undefined().optional(), items: legacyCartItemsSchema }),
  z.strictObject({ cartFormat: z.enum(['packs-v1', 'packs-v2']), items: packCartItemsSchema }),
]);

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

export const offerIdSchema = z.union([z.literal('standard'), z.uuid()]);

const mutationFields = {
  version: versionSchema, operationId: operationSchema, reason: z.string().trim().min(1).max(500),
};

const offerFields = {
  unitsPerPack: integerSchema.min(1).max(99), unitAmount: integerSchema.min(1).max(99999999),
  sortOrder: integerSchema.max(9999),
};

export const createOfferSchema = z.strictObject({
  ...mutationFields, ...offerFields, sortOrder: offerFields.sortOrder.default(0),
});
export const updateOfferSchema = z.strictObject({
  ...mutationFields, ...z.object(offerFields).partial().shape,
  status: z.enum(['draft', 'active', 'archived']).optional(),
}).refine(value => ['unitsPerPack', 'unitAmount', 'sortOrder', 'status'].some(key => key in value));
export const reorderOffersSchema = z.strictObject({
  ...mutationFields,
  offerIds: z.array(z.uuid()).max(20).refine(ids => new Set(ids).size === ids.length),
});
export const duplicateOfferSchema = z.strictObject(mutationFields);
export const storefrontSchema = z.strictObject({
  ...mutationFields,
  homeOfferIds: z.array(offerIdSchema).max(3).refine(ids => new Set(ids).size === ids.length),
  highlightedOfferId: offerIdSchema.nullable(), highlightBadge: z.enum(['bestValue', 'recommended']),
}).refine(value => value.highlightedOfferId === null || value.homeOfferIds.includes(value.highlightedOfferId));
export const inventoryAdjustmentSchema = z.strictObject({
  mode: z.enum(['delta', 'set']), quantity: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  expectedInventoryVersion: versionSchema, operationId: operationSchema,
  reason: z.string().trim().min(1).max(500),
}).refine(value => value.mode !== 'set' || value.quantity >= 0);
