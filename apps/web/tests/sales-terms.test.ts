import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';

import { collections } from '../src/_app/commerce/collections.server';
import { migrateCommerce } from '../src/_app/commerce/migrations.server';
import { createMockOrder } from '../src/_app/commerce/mock-checkout.server';
import { createProduct } from '../src/_app/commerce/products.server';
import { reserveOrder } from '../src/_app/commerce/reservations.server';
import { readActiveSalesTerms } from '../src/_app/commerce/sales-terms.server';
import { ApiError } from '../src/shared/lib/api/index.server';
import { hashToken, randomToken } from '../src/shared/lib/security/index.server';

import { syntheticShipping } from './helpers/shipping';

const keys = ['SALES_TERMS_POLICY_VERSION', 'SALES_TERMS_EFFECTIVE_AT', 'MOCK_CHECKOUT_ENABLED'] as const;
const active = { SALES_TERMS_POLICY_VERSION: 'first-order-v2', SALES_TERMS_EFFECTIVE_AT: '2020-01-01T00:00:00Z' };

test('sales terms require explicit valid activation and do not activate future terms', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  assert.equal(readActiveSalesTerms(now, {}), undefined);
  assert.equal(readActiveSalesTerms(now, { ...active, SALES_TERMS_EFFECTIVE_AT: '2030-01-01T00:00:00Z' }), undefined);
  assert.deepEqual(readActiveSalesTerms(now, active), {
    policyVersion: 'first-order-v2', effectiveAt: new Date(active.SALES_TERMS_EFFECTIVE_AT),
  });

  for (const config of [{ SALES_TERMS_POLICY_VERSION: 'v2' }, { SALES_TERMS_EFFECTIVE_AT: active.SALES_TERMS_EFFECTIVE_AT },
    { ...active, SALES_TERMS_EFFECTIVE_AT: 'invalid' }, { ...active, SALES_TERMS_POLICY_VERSION: ' ' }]) {
    assert.throws(() => readActiveSalesTerms(now, config),
      (error: unknown) => error instanceof ApiError && error.code === 'SALES_TERMS_CONFIGURATION');
  }
});

test('new orders snapshot terms; exact replay ignores later activation changes', { timeout: 120000 }, async () => {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const client = await new MongoClient(replica.getUri()).connect();
  const context = { client, db: client.db('sales_terms_local_test') };

  try {
    for (const key of keys) delete process.env[key];

    await migrateCommerce(context.db);
    await createProduct(context, new ObjectId(), { sku: 'POLICY', name: 'Synthetic policy test', shortDescription: '',
      unitAmount: 1999, stockQuantity: 12, salesEnabled: true, operationId: randomUUID() });

    const input = () => ({ cartFormat: 'packs-v1' as const,
      items: [{ sku: 'POLICY', offerId: 'standard', quantity: 1, productVersion: 1 }],
      creationKeyHash: hashToken(randomToken()), guestTokenHash: hashToken(randomToken()),
      guestAccessExpiresAt: new Date(Date.now() + 3600000), expiresAt: new Date(Date.now() + 1800000),
      livemode: false, pricingPolicy: { shipping: 'test', tax: 'test', discount: 'none-v1' as const } });

    const oldInput = input();
    const old = await reserveOrder(context, oldInput);
    Object.assign(process.env, active);
    const currentInput = input();
    const current = await reserveOrder(context, currentInput);
    const { orders, products } = collections(context.db);
    assert.equal((await orders.findOne({ _id: old.orderId }))?.salesTerms, undefined);
    assert.deepEqual((await orders.findOne({ _id: current.orderId }))?.salesTerms, {
      policyVersion: active.SALES_TERMS_POLICY_VERSION, effectiveAt: new Date(active.SALES_TERMS_EFFECTIVE_AT),
    });
    process.env.SALES_TERMS_EFFECTIVE_AT = 'invalid';
    assert.equal((await reserveOrder(context, currentInput)).replayed, true);
    assert.equal((await reserveOrder(context, oldInput)).replayed, true);
    await assert.rejects(reserveOrder(context, input()),
      (error: unknown) => error instanceof ApiError && error.code === 'SALES_TERMS_CONFIGURATION');
    assert.equal((await products.findOne({ sku: 'POLICY' }))?.inventory.reservedQuantity, 2);
    assert.equal(await orders.countDocuments(), 2);
    process.env.MOCK_CHECKOUT_ENABLED = 'true';

    for (const key of ['SALES_TERMS_POLICY_VERSION', 'SALES_TERMS_EFFECTIVE_AT']) delete process.env[key];

    const mockInput = () => ({ cartFormat: 'packs-v2' as const, shippingAddress: syntheticShipping,
      items: input().items, operationId: randomUUID(), guestToken: randomToken() });

    const oldMock = await createMockOrder(context, mockInput());
    Object.assign(process.env, active);
    const activeMockInput = mockInput();
    const activeMock = await createMockOrder(context, activeMockInput);
    assert.equal((await orders.findOne({ _id: new ObjectId(oldMock.id) }))?.salesTerms, undefined);
    assert.deepEqual((await orders.findOne({ _id: new ObjectId(activeMock.id) }))?.salesTerms, {
      policyVersion: active.SALES_TERMS_POLICY_VERSION, effectiveAt: new Date(active.SALES_TERMS_EFFECTIVE_AT),
    });
    process.env.SALES_TERMS_EFFECTIVE_AT = 'invalid';
    assert.equal((await createMockOrder(context, activeMockInput)).replayed, true);
    await assert.rejects(createMockOrder(context, mockInput()),
      (error: unknown) => error instanceof ApiError && error.code === 'SALES_TERMS_CONFIGURATION');
    assert.equal((await products.findOne({ sku: 'POLICY' }))?.inventory.stockQuantity, 10);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }

    await client.close();
    await replica.stop();
  }
});
