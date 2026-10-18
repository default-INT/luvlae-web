import 'server-only';

import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { fail } from '@/shared/lib/api/index.server';

import { idSchema } from './contracts';

import type { Collection, Document } from 'mongodb';

const cursorSchema = z.strictObject({ id: idSchema, at: z.iso.datetime() });

export const readPage = async (
  collection: Collection<Document>, request: Request, field: 'createdAt' | 'recordedAt', filter: Document,
) => {
  const params = new URL(request.url).searchParams;
  const limit = z.coerce.number().int().min(1).max(100).parse(params.get('limit') ?? 25);
  const cursor = params.get('cursor');
  let boundary: Document = {};
  if (cursor) {
    if (cursor.length > 300 || !/^[A-Za-z0-9_-]+$/.test(cursor)) fail(400, 'INVALID_CURSOR', 'Invalid pagination cursor.');
    let decoded: unknown;
    try {
      decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    } catch {
      return fail(400, 'INVALID_CURSOR', 'Invalid pagination cursor.');
    }
    const value = cursorSchema.parse(decoded);
    const at = new Date(value.at);
    boundary = { $or: [{ [field]: { $lt: at } }, { [field]: at, _id: { $lt: new ObjectId(value.id) } }] };
  }
  const items = await collection.find({ $and: [filter, boundary] }).sort({ [field]: -1, _id: -1 }).limit(limit + 1).toArray();
  const more = items.length > limit;
  if (more) items.pop();
  const last = items.at(-1);

  const nextCursor = more && last ? Buffer.from(JSON.stringify({
    id: last._id.toHexString(), at: last[field].toISOString(),
  })).toString('base64url') : null;

  return { items, nextCursor };
};
