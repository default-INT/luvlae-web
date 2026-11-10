export const standardOfferId = 'standard';

export interface PackSnapshot {
  offerId: string;
  unitsPerPack: number;
  inventoryQuantity: number;
}

export interface PackSnapshotInput extends Partial<PackSnapshot> {
  quantity: number;
  unitAmount: number;
  lineSubtotal: number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const normalizePackSnapshot = (item: PackSnapshotInput): PackSnapshot | null => {
  const present = [item.offerId !== undefined, item.unitsPerPack !== undefined, item.inventoryQuantity !== undefined];
  const legacy = present.every(value => !value);

  if (!Number.isSafeInteger(item.quantity) || item.quantity < 1
    || !Number.isSafeInteger(item.unitAmount) || item.unitAmount < 1
    || !Number.isSafeInteger(item.lineSubtotal) || item.lineSubtotal !== item.quantity * item.unitAmount) return null;

  if (legacy) return { offerId: standardOfferId, unitsPerPack: 1, inventoryQuantity: item.quantity };

  if (!present.every(Boolean) || typeof item.offerId !== 'string'
    || (item.offerId !== standardOfferId && !uuidPattern.test(item.offerId))
    || !Number.isSafeInteger(item.unitsPerPack) || item.unitsPerPack! < 1 || item.unitsPerPack! > 99
    || (item.offerId === standardOfferId && item.unitsPerPack !== 1)
    || !Number.isSafeInteger(item.inventoryQuantity)
    || item.inventoryQuantity !== item.quantity * item.unitsPerPack!) return null;

  return { offerId: item.offerId, unitsPerPack: item.unitsPerPack!, inventoryQuantity: item.inventoryQuantity! };
};
