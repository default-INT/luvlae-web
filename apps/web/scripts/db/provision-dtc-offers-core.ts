import { createOffer, updateOffer, updateStorefront } from '../../src/_app/commerce/catalog-mutations.server';
import { collections } from '../../src/_app/commerce/collections.server';
import { updateProduct } from '../../src/_app/commerce/products.server';

import type { ObjectId } from 'mongodb';
import type { DatabaseContext } from '../../src/shared/lib/mongodb/index.server';

export interface ProvisionAuditStep {
  action: string;
  entityType: string;
  entityId: string;
  changes?: { result?: { offerId?: string } };
}

export type StepState = 'pending' | 'completed' | 'drift';

export const classifyProvisionStep = (
  audit: ProvisionAuditStep | null,
  expected: { action: string; entityId?: string },
): StepState => {
  if (!audit) return 'pending';

  return audit.action === expected.action && audit.entityType === 'product' &&
    (!expected.entityId || audit.entityId === expected.entityId) ? 'completed' : 'drift';
};

export const offerIdFromProvisionAudit = (audit: ProvisionAuditStep | null, action: string, productId: string) => {
  if (classifyProvisionStep(audit, { action, entityId: productId }) !== 'completed') return null;

  const id = audit?.changes?.result?.offerId;
  return typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
};

export const provisionOperationIds = {
  basePrice: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb101',
  createTwo: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb102',
  publishTwo: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb103',
  createThree: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb104',
  publishThree: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb105',
  homeOffers: 'ff93c88d-44fd-4cf4-9816-6f9f0b8bb106',
} as const;

const sku = 'LUVLAE-BERBERINE-60';

const targetOffers = [
  { unitsPerPack: 2, unitAmount: 2999, sortOrder: 1, create: provisionOperationIds.createTwo,
    publish: provisionOperationIds.publishTwo },
  { unitsPerPack: 3, unitAmount: 3999, sortOrder: 2, create: provisionOperationIds.createThree,
    publish: provisionOperationIds.publishThree },
] as const;

export const inspectDtcProvisioning = async (context: DatabaseContext) => {
  const { products, audit } = collections(context.db);
  const product = await products.findOne({ sku });

  if (!product) throw new Error(`Target product ${sku} was not found; no product will be created by this operation.`);

  const productId = product._id.toHexString();
  const auditRows = await audit.find({ operationId: { $in: Object.values(provisionOperationIds) } }).toArray();
  const auditByOperation = new Map(auditRows.map(row => [row.operationId, row]));

  const auditState = (operationId: string, action: string) => {
    const row = auditByOperation.get(operationId);
    return classifyProvisionStep(row ? { action: row.action, entityType: row.entityType,
      entityId: row.entityId.toHexString(), changes: row.changes as { result?: { offerId?: string } } } : null,
    { action, entityId: productId });
  };

  const auditOfferId = (operationId: string) => offerIdFromProvisionAudit(
    auditByOperation.get(operationId) ? {
      action: auditByOperation.get(operationId)!.action,
      entityType: auditByOperation.get(operationId)!.entityType,
      entityId: auditByOperation.get(operationId)!.entityId.toHexString(),
      changes: auditByOperation.get(operationId)!.changes as { result?: { offerId?: string } },
    } : null, 'offer.create', productId);

  const stepStates = [
    auditState(provisionOperationIds.basePrice, 'product.update'),
    auditState(provisionOperationIds.createTwo, 'offer.create'),
    auditState(provisionOperationIds.publishTwo, 'offer.update'),
    auditState(provisionOperationIds.createThree, 'offer.create'),
    auditState(provisionOperationIds.publishThree, 'offer.update'),
    auditState(provisionOperationIds.homeOffers, 'storefront.update'),
  ];

  const steps = ['basePrice', 'createTwo', 'publishTwo', 'createThree', 'publishThree', 'homeOffers']
    .map((step, index) => ({ step, state: stepStates[index] }));

  const drift: string[] = [];

  if (stepStates.includes('drift')) drift.push('operation audit action/product mismatch');

  const ids = targetOffers.map(target => auditOfferId(target.create));

  if (ids.some((id, index) => auditState(targetOffers[index].create, 'offer.create') === 'completed' && !id)) {
    drift.push('offer creation audit has no recoverable offer ID');
  }

  const trackedIds = new Set(ids.filter((id): id is string => !!id));

  const untracked = (product.offers ?? []).some(offer => !trackedIds.has(offer.id) &&
    targetOffers.some(target => offer.unitsPerPack === target.unitsPerPack));

  if (untracked) drift.push('matching untracked offer exists; manual adoption/reconciliation required');

  if (auditState(provisionOperationIds.basePrice, 'product.update') === 'completed' && product.price.unitAmount !== 1999) {
    drift.push('base price changed after provisioning began');
  }

  for (const [index, target] of targetOffers.entries()) {
    const id = ids[index];
    const offer = id ? product.offers?.find(item => item.id === id) : undefined;
    const publishComplete = auditState(target.publish, 'offer.update') === 'completed';
    const expectedStatus = publishComplete ? 'active' : 'draft';

    const offerDrift = !offer || offer.status !== expectedStatus || offer.unitsPerPack !== target.unitsPerPack ||
      offer.price.unitAmount !== target.unitAmount || offer.sortOrder !== target.sortOrder;

    if (auditState(target.create, 'offer.create') === 'completed' && offerDrift) {
      drift.push(`${target.unitsPerPack}-Pack differs from the audited ${expectedStatus} state`);
    }
  }

  if (auditState(provisionOperationIds.homeOffers, 'storefront.update') === 'completed' &&
    (ids.some(id => !id) || product.storefront?.homeOfferIds.join('|') !== `standard|${ids.join('|')}` ||
      product.storefront?.highlightedOfferId !== ids[0] || product.storefront.highlightBadge !== 'bestValue')) {
    drift.push('home offer selection changed after provisioning began');
  }

  return { product, steps, drift, ids };
};

export const provisionDtcOffers = async (context: DatabaseContext, adminId: ObjectId) => {
  const inspection = await inspectDtcProvisioning(context);

  if (inspection.drift.length) throw new Error(`${inspection.drift.join('; ')}. Preserve catalog changes and review manually.`);

  const { products } = collections(context.db);
  let expectedVersion = inspection.product.version;

  const current = async () => {
    const value = await products.findOne({ sku });

    if (!value) throw new Error('Target product disappeared during provisioning.');

    return value;
  };

  const assertVersion = (value: Awaited<ReturnType<typeof current>>) => {
    if (value.version !== expectedVersion) {
      throw new Error('Product catalog changed during provisioning; preserve the edit and rerun the dry run.');
    }
  };

  const completed = (operationId: string) => inspection.steps.some(step =>
    provisionOperationIds[step.step as keyof typeof provisionOperationIds] === operationId && step.state === 'completed');

  const ensureBase = async () => {
    if (!completed(provisionOperationIds.basePrice)) {
      const value = await current();
      assertVersion(value);
      await updateProduct(context, adminId, sku, { version: value.version, unitAmount: 1999,
        operationId: provisionOperationIds.basePrice, reason: 'Initialize approved DTC offer catalog.' });
      expectedVersion += 1;
    }
  };

  const ensureOffer = async (target: typeof targetOffers[number]) => {
    const targetIndex = targetOffers.indexOf(target);
    let offerId = inspection.ids[targetIndex];

    if (!offerId) {
      const value = await current();
      assertVersion(value);

      const created = await createOffer(context, adminId, sku, { version: value.version, operationId: target.create,
        reason: 'Initialize approved DTC offer catalog.', unitsPerPack: target.unitsPerPack,
        unitAmount: target.unitAmount, sortOrder: target.sortOrder });

      offerId = created.offerId ?? null;
      expectedVersion += 1;
    }

    if (!offerId) throw new Error(`Could not recover the ${target.unitsPerPack}-Pack offer ID.`);

    if (!completed(target.publish)) {
      const value = await current();
      assertVersion(value);
      const offer = value.offers?.find(item => item.id === offerId);

      if (!offer || offer.status !== 'draft' || offer.unitsPerPack !== target.unitsPerPack ||
        offer.price.unitAmount !== target.unitAmount || offer.sortOrder !== target.sortOrder) {
        throw new Error(`The ${target.unitsPerPack}-Pack changed before publishing; preserve it and review manually.`);
      }

      await updateOffer(context, adminId, sku, offerId, { version: value.version, operationId: target.publish,
        reason: 'Publish approved DTC offer catalog.', unitsPerPack: target.unitsPerPack,
        unitAmount: target.unitAmount, sortOrder: target.sortOrder, status: 'active' });
      expectedVersion += 1;
    }

    return offerId;
  };

  await ensureBase();
  const resolvedIds: string[] = [];

  for (const target of targetOffers) resolvedIds.push(await ensureOffer(target));

  if (!completed(provisionOperationIds.homeOffers)) {
    const value = await current();
    assertVersion(value);
    await updateStorefront(context, adminId, sku, { version: value.version,
      operationId: provisionOperationIds.homeOffers, reason: 'Initialize approved DTC offer catalog.',
      homeOfferIds: ['standard', ...resolvedIds], highlightedOfferId: resolvedIds[0], highlightBadge: 'bestValue' });
    expectedVersion += 1;
  }

  const finalProduct = await current();

  const drift = finalProduct.price.unitAmount !== 1999 || resolvedIds.some((id, index) => {
    const offer = finalProduct.offers?.find(item => item.id === id);
    const target = targetOffers[index];
    return !offer || offer.status !== 'active' || offer.unitsPerPack !== target.unitsPerPack ||
      offer.price.unitAmount !== target.unitAmount;
  }) || finalProduct.storefront?.homeOfferIds.join('|') !== `standard|${resolvedIds.join('|')}` ||
    finalProduct.storefront?.highlightedOfferId !== resolvedIds[0] || finalProduct.storefront.highlightBadge !== 'bestValue';

  if (drift) {
    throw new Error('Catalog values differ from the provisioned target; no automatic repair was attempted. Review manually.');
  }

  return { sku, offerCount: resolvedIds.length, stockQuantity: finalProduct.inventory.stockQuantity,
    reservedQuantity: finalProduct.inventory.reservedQuantity };
};
