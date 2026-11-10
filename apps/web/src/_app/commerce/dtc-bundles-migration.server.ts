import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { Db, Document } from 'mongodb';

export const dtcBundlesMigrationName = '008-dtc-bundles';

const integer = { bsonType: ['int', 'long', 'double'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER, multipleOf: 1 };
const positive = { ...integer, minimum: 1 };
const text = { bsonType: 'string', minLength: 1, maxLength: 2000 };
const date = { bsonType: 'date' };
const uuid = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const offerId = { bsonType: 'string', pattern: `^(standard|${uuid})$` };

const packProperties = {
  offerId,
  unitsPerPack: { ...positive, maximum: 99 },
  inventoryQuantity: { ...positive, maximum: 9801 },
};

const offer = {
  bsonType: 'object', additionalProperties: false,
  required: ['id', 'unitsPerPack', 'price', 'status', 'sortOrder', 'createdAt', 'updatedAt'],
  properties: {
    id: { bsonType: 'string', pattern: uuid }, unitsPerPack: { ...positive, maximum: 99 },
    price: { bsonType: 'object', additionalProperties: false, required: ['currency', 'unitAmount'],
      properties: { currency: { enum: ['USD'] }, unitAmount: positive } },
    status: { enum: ['draft', 'active', 'archived'] },
    sortOrder: { ...integer, maximum: 9999 }, createdAt: date, updatedAt: date,
  },
};

const storefront = {
  bsonType: 'object', additionalProperties: false,
  required: ['homeOfferIds', 'highlightedOfferId', 'highlightBadge'],
  properties: {
    homeOfferIds: { bsonType: 'array', maxItems: 3, uniqueItems: true, items: offerId },
    highlightedOfferId: { bsonType: ['string', 'null'], pattern: `^(standard|${uuid})$` },
    highlightBadge: { enum: ['bestValue', 'recommended'] },
  },
};

const snapshotExpression = (itemsPath: string) => ({
  $allElementsTrue: {
    $map: {
      input: `$${itemsPath}`, as: 'item', in: {
        $let: {
          vars: {
            offer: { $ne: [{ $type: '$$item.offerId' }, 'missing'] },
            units: { $ne: [{ $type: '$$item.unitsPerPack' }, 'missing'] },
            inventory: { $ne: [{ $type: '$$item.inventoryQuantity' }, 'missing'] },
          },
          in: {
            $or: [
              { $and: [{ $eq: ['$$offer', false] }, { $eq: ['$$units', false] }, { $eq: ['$$inventory', false] }] },
              { $and: [
                { $eq: ['$$offer', true] }, { $eq: ['$$units', true] }, { $eq: ['$$inventory', true] },
                { $eq: ['$$item.inventoryQuantity', { $multiply: ['$$item.quantity', '$$item.unitsPerPack'] }] },
                { $eq: ['$$item.lineSubtotal', { $multiply: ['$$item.quantity', '$$item.unitAmount'] }] },
                { $or: [{ $ne: ['$$item.offerId', 'standard'] }, { $eq: ['$$item.unitsPerPack', 1] }] },
              ] },
            ],
          },
        },
      },
    },
  },
});

const productExpression = {
  $and: [
    { $lte: ['$inventory.reservedQuantity', '$inventory.stockQuantity'] },
    { $lte: [{ $size: { $ifNull: ['$offers', []] } }, 100] },
    { $lte: [{ $size: { $filter: {
      input: { $ifNull: ['$offers', []] }, as: 'offer', cond: { $ne: ['$$offer.status', 'archived'] },
    } } }, 20] },
    { $eq: [
      { $size: { $setUnion: [{ $map: {
        input: { $ifNull: ['$offers', []] }, as: 'offer', in: '$$offer.id',
      } }, []] } },
      { $size: { $ifNull: ['$offers', []] } },
    ] },
    { $or: [
      { $eq: [{ $type: '$storefront' }, 'missing'] },
      { $and: [
        { $lte: [{ $size: { $ifNull: ['$storefront.homeOfferIds', []] } }, 3] },
        { $eq: [
          { $size: { $setUnion: [{ $ifNull: ['$storefront.homeOfferIds', []] }, []] } },
          { $size: { $ifNull: ['$storefront.homeOfferIds', []] } },
        ] },
        { $or: [
          { $eq: [{ $ifNull: ['$storefront.highlightedOfferId', null] }, null] },
          { $in: [{ $ifNull: ['$storefront.highlightedOfferId', null] }, { $ifNull: ['$storefront.homeOfferIds', []] }] },
        ] },
        { $allElementsTrue: { $map: { input: { $ifNull: ['$storefront.homeOfferIds', []] }, as: 'homeId', in: {
          $or: [
            { $eq: ['$$homeId', 'standard'] },
            { $in: ['$$homeId', { $map: {
              input: { $filter: {
                input: { $ifNull: ['$offers', []] }, as: 'offer', cond: { $eq: ['$$offer.status', 'active'] },
              } },
              as: 'offer', in: '$$offer.id',
            } }] },
          ],
        } } } },
      ] },
    ] },
  ],
};

const schemaWith = (schema: Document, properties: Document) => ({
  ...schema, properties: { ...schema.properties, ...properties },
});

const combineExpressions = (current: Document | undefined, next: Document) => (
  current ? { $and: [current, next] } : next
);

const packItemSchema = (schema: Document) => {
  const properties = { ...schema.properties, ...packProperties };
  const allAbsent = { not: { anyOf: ['offerId', 'unitsPerPack', 'inventoryQuantity'].map(field => ({ required: [field] })) } };
  return { ...schema, properties, oneOf: [
    { ...schema, properties, ...allAbsent },
    { ...schema, properties, required: [...new Set([...(schema.required ?? []), ...Object.keys(packProperties)])] },
  ] };
};

const extendOrderItems = (schema: Document) => {
  const items = schema.properties.items;
  return { ...schema, properties: { ...schema.properties, items: { ...items, items: packItemSchema(items.items) } } };
};

const extendPricingPolicy = (schema: Document) => {
  const pricingPolicy = schema.properties.pricingPolicy;
  return { ...schema, properties: { ...schema.properties, pricingPolicy: {
    ...pricingPolicy, properties: { ...pricingPolicy.properties, catalog: { enum: ['packs-v1'] } },
  } } };
};

const updateValidator = async (db: Db, name: string, update: (validator: Document) => Document) => {
  const info = await db.listCollections({ name }, { nameOnly: false }).next();
  const validator = info?.options?.validator as Document | undefined;

  if (!validator?.$jsonSchema?.properties) fail(503, 'DATABASE_NOT_READY', 'Run the commerce schema migration first.');

  await db.command({ collMod: name, validator: update(validator as Document),
    validationLevel: 'strict', validationAction: 'error' });
};

export const migrateDtcBundles = async (db: Db) => {
  if (await db.collection('_migrations').findOne({ name: dtcBundlesMigrationName })) return;

  const owner = new ObjectId().toHexString();
  await db.collection('_migrationLocks').insertOne({ _id: new ObjectId('000000000000000000000001'), owner });

  try {
    await updateValidator(db, 'products', validator => {
      const schema = validator.$jsonSchema;

      const properties = {
        inventory: { ...schema.properties.inventory, properties: {
          ...schema.properties.inventory.properties, version: { ...positive, minimum: 1 },
        } },
        offers: { bsonType: 'array', maxItems: 100, items: offer },
        storefront,
      };

      return {
        ...validator, $jsonSchema: schemaWith(schema, properties),
        $expr: combineExpressions(validator.$expr, productExpression),
      };
    });

    // Extend order items and frozen quote snapshots while preserving old snapshot shape and bytes.
    await updateValidator(db, 'orders', validator => {
      const schema = validator.$jsonSchema;
      const next = extendPricingPolicy(extendOrderItems(schema));
      return { ...validator, $jsonSchema: schemaWith(next, { salesTerms: {
        bsonType: 'object', additionalProperties: false, required: ['policyVersion', 'effectiveAt'],
        properties: { policyVersion: text, effectiveAt: date },
      } }), $expr: combineExpressions(validator.$expr, snapshotExpression('items')) };
    });

    await updateValidator(db, 'checkoutAttempts', validator => {
      const schema = validator.$jsonSchema;
      const quoteSnapshot = schema.properties.quoteSnapshot;
      const nextQuote = extendPricingPolicy(extendOrderItems(quoteSnapshot));
      return { ...validator, $jsonSchema: schemaWith(schema, { quoteSnapshot: nextQuote }),
        $expr: combineExpressions(validator.$expr, snapshotExpression('quoteSnapshot.items')) };
    });

    await updateValidator(db, 'notificationJobs', validator => {
      const schema = validator.$jsonSchema;
      const content = schema.properties.content;

      const contentItems = {
        bsonType: 'array', maxItems: 20,
        items: packItemSchema({ bsonType: 'object', additionalProperties: false,
          required: ['name', 'quantity', 'unitAmount', 'lineSubtotal'],
          properties: { name: text, quantity: positive, unitAmount: positive, lineSubtotal: integer } }),
      };

      return { ...validator, $jsonSchema: schemaWith(schema, { content: {
        ...content, properties: { ...content.properties, items: contentItems },
      } }), $expr: combineExpressions(validator.$expr, snapshotExpression('content.items')) };
    });

    await db.collection('products').updateMany({ offers: { $exists: false } }, { $set: { offers: [] } });
    await db.collection('products').updateMany(
      { 'inventory.version': { $exists: false } }, { $set: { 'inventory.version': 1 } },
    );

    await db.collection('_migrations').insertOne({ name: dtcBundlesMigrationName, appliedAt: new Date() });
  } finally {
    await db.collection('_migrationLocks').deleteOne({ owner });
  }
};
