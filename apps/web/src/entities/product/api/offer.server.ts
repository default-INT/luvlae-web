import 'server-only';

import { withDatabase } from '@/shared/lib/mongodb/index.server';

import type { ProductOffer } from '../model/offer';
import type { ObjectId } from 'mongodb';

interface OfferDocument {
  _id: ObjectId; sku: string; name: string; shortDescription: string;
  price: ProductOffer['price']; inventory: { stockQuantity: number; reservedQuantity: number };
  salesEnabled: boolean; version: number;
}

export const getProductOffer = (sku: string): Promise<ProductOffer | null> => withDatabase(async ({ db }) => {
  const offer = await db.collection<OfferDocument>('products').findOne({ sku, salesEnabled: true });
  if (!offer) return null;
  return {
    id: offer._id.toHexString(), sku: offer.sku, name: offer.name, shortDescription: offer.shortDescription,
    price: offer.price, salesEnabled: offer.salesEnabled, version: offer.version,
    availableQuantity: offer.inventory.stockQuantity - offer.inventory.reservedQuantity,
  };
});
