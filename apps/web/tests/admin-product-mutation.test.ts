import assert from 'node:assert/strict';
import { test } from 'node:test';

import { AdminApiError } from '../src/_pages/admin/api/admin';
import { createProductMutation } from '../src/_pages/admin/ui/ProductEditor/utils/productMutation';

test('lost delta response freezes the exact request across stock refresh and attempted rebase', async () => {
  let stock = 10;
  let inventoryVersion = 1;
  let loseResponse = true;
  let operationIds = 0;
  const committed = new Set<string>();
  const sent: Record<string, unknown>[] = [];

  const transaction = createProductMutation({
    operationId: () => `operation-${++operationIds}`,
    reload: async () => {},
    send: async (_path, body) => {
      sent.push(body);
      const id = String(body.operationId);

      if (!committed.has(id)) {
        assert.equal(body.expectedInventoryVersion, inventoryVersion);
        stock += Number(body.quantity);
        inventoryVersion += 1;
        committed.add(id);
      }

      if (loseResponse) { loseResponse = false; throw new Error('Response lost after commit'); }
    },
  });

  const body = { mode: 'delta', quantity: 3, expectedInventoryVersion: 1, reason: 'Stock received' };

  assert.equal((await transaction.run('/products/SKU/inventory/adjustments', body, 1)).kind, 'failed');
  assert.equal(stock, 13);
  assert.equal(transaction.phase, 'uncertain');
  assert.equal(transaction.canEdit, false);
  // A refreshed observation must not permit a new operation with its newer stock version.
  assert.equal(inventoryVersion, 2);
  assert.deepEqual(await transaction.run('/products/SKU/inventory/adjustments', {
    ...body, expectedInventoryVersion: inventoryVersion,
  }, inventoryVersion), { kind: 'blocked' });
  body.quantity = 8;
  assert.deepEqual(await transaction.retry(), { kind: 'saved', version: 2 });
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(sent[1].quantity, 3);
  assert.equal(operationIds, 1);
  assert.equal(stock, 13);
  assert.equal(transaction.canEdit, true);
});

test('accepted delta followed by failed readback retries only the read, never the write', async () => {
  let stock = 10;
  let writes = 0;
  let reads = 0;

  const transaction = createProductMutation({
    operationId: () => 'accepted-operation',
    send: async (_path, body) => { writes += 1; stock += Number(body.quantity); },
    reload: async () => { reads += 1;

      if (reads === 1) throw new Error('Readback unavailable'); },
  });

  const body = { mode: 'delta', quantity: 3, expectedInventoryVersion: 1, reason: 'Stock received' };

  assert.deepEqual(await transaction.run('/inventory', body, 1), { kind: 'acceptedRefreshFailed', version: 2 });
  assert.equal(transaction.phase, 'accepted');
  assert.equal(transaction.canEdit, false);
  assert.deepEqual(await transaction.run('/inventory', { ...body, expectedInventoryVersion: 2 }, 2), { kind: 'blocked' });
  assert.deepEqual(await transaction.retry(), { kind: 'saved', version: 2 });
  assert.equal(writes, 1);
  assert.equal(reads, 2);
  assert.equal(stock, 13);
});

test('a definite inventory version rejection permits draft review without preserving an uncertain write', async () => {
  const transaction = createProductMutation({
    operationId: () => 'rejected-operation', reload: async () => {},
    send: async () => { throw new AdminApiError('INVENTORY_VERSION_CONFLICT', 409); },
  });

  assert.equal((await transaction.run('/inventory', { quantity: 3 }, 1)).kind, 'failed');
  assert.equal(transaction.phase, 'idle');
  assert.equal(transaction.canEdit, true);
  assert.deepEqual(await transaction.retry(), { kind: 'blocked' });
});
