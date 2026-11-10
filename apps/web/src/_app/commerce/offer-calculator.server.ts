import 'server-only';

import { fail } from '@/shared/lib/api/index.server';
import { publicOffers } from '@/entities/product';

import type { Product } from './models';

export { publicOffers } from '@/entities/product';

export const resolveOffer = (product: Product, offerId: string, productVersion?: number) => {
  if (!product.salesEnabled) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');

  if (productVersion !== undefined && productVersion !== product.version) {
    fail(409, 'PRICE_CHANGED', 'Reload the product before checking out.');
  }

  const offer = publicOffers(product).find(value => value.id === offerId);

  if (!offer) return fail(409, 'OFFER_UNAVAILABLE', 'This offer is unavailable.');

  return offer;
};

export const calculateOfferItems = (products: Product[], requests: {
  sku: string; offerId: string; quantity: number; productVersion?: number;
}[]) => {
  const demand = new Map<string, number>();
  const keys = new Set<string>();

  if (!requests.length || requests.length > 20) fail(400, 'INVALID_QUANTITY', 'Invalid cart size.');

  const items = requests.map(request => {
    const key = `${request.sku}:${request.offerId}`;

    if (keys.has(key)) fail(400, 'INVALID_QUANTITY', 'Duplicate cart line.');

    keys.add(key);
    const product = products.find(value => value.sku === request.sku);

    if (!product) return fail(409, 'PRODUCT_UNAVAILABLE', 'A product is unavailable.');

    const offer = resolveOffer(product, request.offerId, request.productVersion);
    const inventoryQuantity = request.quantity * offer.unitsPerPack;
    const lineSubtotal = request.quantity * offer.price.unitAmount;

    if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || !Number.isSafeInteger(lineSubtotal)
      || lineSubtotal < 1 || !Number.isSafeInteger(inventoryQuantity)) {
      fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
    }

    const total = (demand.get(product.sku) ?? 0) + inventoryQuantity;

    if (total > 99) fail(400, 'INVALID_QUANTITY', 'A maximum of 99 boxes is supported per product.');

    demand.set(product.sku, total);

    if (total > product.inventory.stockQuantity - product.inventory.reservedQuantity) {
      fail(409, 'OUT_OF_STOCK', 'Requested quantity is unavailable.');
    }

    return { productId: product._id, sku: product.sku,
      name: `${product.name} — ${offer.unitsPerPack}-Pack (${offer.patchesPerPack} patches)`,
      offerId: offer.id, unitsPerPack: offer.unitsPerPack, inventoryQuantity,
      quantity: request.quantity, unitAmount: offer.price.unitAmount, lineSubtotal, productVersion: product.version };
  });

  const subtotal = items.reduce((sum, item) => sum + item.lineSubtotal, 0);

  if (!Number.isSafeInteger(subtotal) || subtotal > 99999999) {
    fail(400, 'INVALID_AMOUNT', 'Amount exceeds supported bounds.');
  }

  return items;
};
