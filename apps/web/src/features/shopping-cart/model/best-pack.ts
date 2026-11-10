import type { PurchaseOffer } from '@/entities/product';

interface Selection { offer: PurchaseOffer; quantity: number }
interface Plan { total: number; selections: Selection[] }

// Exact box count only: a lower unit price never authorizes adding extra boxes.
export const bestPackPlan = (offers: PurchaseOffer[], boxes: number): Plan | null => {
  if (!Number.isSafeInteger(boxes) || boxes < 1 || boxes > 99) return null;

  const plans: (Plan | null)[] = Array.from({ length: boxes + 1 }, () => null);
  plans[0] = { total: 0, selections: [] };

  for (const offer of offers) {
    if (!Number.isSafeInteger(offer.unitsPerPack) || offer.unitsPerPack < 1
      || !Number.isSafeInteger(offer.price.unitAmount) || offer.price.unitAmount < 1) continue;

    const previous = plans.map(plan => plan);
    const limit = Math.min(99, Math.floor(boxes / offer.unitsPerPack), offer.availableQuantity);

    for (let count = 1; count <= limit; count++) {
      const units = count * offer.unitsPerPack;

      for (let totalBoxes = units; totalBoxes <= boxes; totalBoxes++) {
        const base = previous[totalBoxes - units];

        if (!base) continue;

        const total = base.total + count * offer.price.unitAmount;
        const selections = [...base.selections, { offer, quantity: count }];
        const current = plans[totalBoxes];

        if (!current || total < current.total || (total === current.total && selections.length < current.selections.length)) {
          plans[totalBoxes] = { total, selections };
        }
      }
    }
  }

  return plans[boxes];
};
