import { bestPackPlan } from './best-pack';
import { cartKey } from './cart';

import type { CartItem, Offer } from './cart';

export const packSuggestion = (items: CartItem[], offers: Record<string, Offer>, sku: string) => {
  const lines = items.filter(item => item.sku === sku);

  if (!lines.length || lines.some(item => !offers[cartKey(item)])) return null;

  const product = lines.map(item => offers[cartKey(item)]).sort((a, b) => b.version - a.version)[0];
  const boxes = lines.reduce((sum, item) => sum + item.quantity * (offers[cartKey(item)].unitsPerPack ?? 1), 0);
  const stock = product.availableBoxes ?? product.availableQuantity * (product.unitsPerPack ?? 1);

  if (!product.salesEnabled || boxes > Math.min(99, stock)) return null;

  const plan = bestPackPlan(product.purchaseOffers ?? [], boxes);
  const previous = lines.reduce((sum, item) => sum + item.quantity * offers[cartKey(item)].price.unitAmount, 0);

  if (!plan || plan.total >= previous || items.length - lines.length + plan.selections.length > 20) return null;

  return { plan, lines, product, stock, boxes, savings: previous - plan.total };
};
