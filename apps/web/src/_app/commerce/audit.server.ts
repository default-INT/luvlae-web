import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { hashToken } from '@/shared/lib/security/index.server';

import { collections } from './collections.server';

import type { ClientSession, Db } from 'mongodb';
import type { AuditEntry } from './models';

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }

  return JSON.stringify(value);
};

export const requestFingerprint = (value: unknown) => hashToken(canonical(value));

export const checkReplay = async (db: Db, session: ClientSession, operationId: string, requestHash: string) => {
  const entry = await collections(db).audit.findOne({ operationId }, { session });

  if (entry && entry.requestHash !== requestHash) {
    fail(409, 'IDEMPOTENCY_CONFLICT', 'The operation ID was already used for another request.');
  }

  return entry;
};

export const appendAudit = (db: Db, session: ClientSession, entry: Omit<AuditEntry, '_id' | 'schemaVersion' | 'createdAt'>) =>
  collections(db).audit.insertOne({ ...entry, _id: new ObjectId(), schemaVersion: 1, createdAt: new Date() }, { session });
