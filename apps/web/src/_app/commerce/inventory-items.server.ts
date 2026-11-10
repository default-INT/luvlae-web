import 'server-only';

import { normalizePackSnapshot } from '@/entities/product';
import { fail } from '@/shared/lib/api/index.server';

import { dtcBundlesMigrationName } from './dtc-bundles-migration.server';

import type { ClientSession, Db } from 'mongodb';
import type { Order } from './models';

export const aggregateInventoryItems = (items: Order['items']) => {
  const totals = new Map<string, { productId: Order['items'][number]['productId']; sku: string; quantity: number }>();

  for (const item of items) {
    const snapshot = normalizePackSnapshot(item);

    if (!snapshot) return fail(409, 'INVALID_PACK_SNAPSHOT', 'The order item requires reconciliation.');

    const current = totals.get(item.sku);

    if (current && !current.productId.equals(item.productId)) {
      fail(409, 'INVALID_PACK_SNAPSHOT', 'The order product identity requires reconciliation.');
    }

    const quantity = (current?.quantity ?? 0) + snapshot.inventoryQuantity;

    if (!Number.isSafeInteger(quantity)) fail(409, 'INVALID_PACK_SNAPSHOT', 'Invalid physical quantity.');

    totals.set(item.sku, { productId: item.productId, sku: item.sku, quantity });
  }

  return [...totals.values()];
};

export const requirePackSchema = async (db: Db, session: ClientSession) => {
  if (!await db.collection('_migrations').findOne({ name: dtcBundlesMigrationName }, { session })) {
    fail(503, 'DATABASE_NOT_READY', 'Run pack schema migration before opening checkout.');
  }
};
