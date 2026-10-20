import 'server-only';

import { MongoClient } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';

import type { ClientSession, Db } from 'mongodb';

export interface DatabaseContext {
  db: Db;
  client: MongoClient;
}

export const createDatabaseClient = () => {
  const uri = process.env.NEXT_MONGODB_URI;
  const username = process.env.NEXT_MONGODB_USERNAME;
  const password = process.env.NEXT_MONGODB_PASSWORD;
  const database = process.env.NEXT_MONGODB_DB_NAME;

  if (!uri || !username || !password || !database) {
    return fail(503, 'DATABASE_NOT_CONFIGURED', 'Database configuration is incomplete.');
  }

  // Accept legacy credential-bearing URIs, but separate credentials remain authoritative.
  const connectionUri = uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^/]*@/, '$1');

  if (!/^mongodb(?:\+srv)?:\/\/[^/@]+(?:\/|$)/.test(connectionUri)) {
    return fail(503, 'DATABASE_NOT_CONFIGURED', 'Use a credential-free MongoDB URI.');
  }

  const client = new MongoClient(connectionUri, {
    auth: { username, password },
    maxPoolSize: 4,
    minPoolSize: 0,
    maxIdleTimeMS: 10000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    retryWrites: true,
    promoteLongs: false,
  });

  return { client, db: client.db(database) };
};

// Workers sockets are request-scoped. Do not reuse a module-global client across requests.
export const withDatabase = async <T>(operation: (context: DatabaseContext) => Promise<T>): Promise<T> => {
  const context = createDatabaseClient();

  try {
    await context.client.connect();
    const migration = await context.db.collection('_migrations').findOne({ name: '001-commerce' });

    if (!migration) fail(503, 'DATABASE_NOT_READY', 'Run database migrations before using the API.');

    return await operation(context);
  } finally {
    await context.client.close();
  }
};

export const inTransaction = async <T>(context: DatabaseContext, operation: (session: ClientSession) => Promise<T>) => {
  const session = context.client.startSession();

  try {
    return await session.withTransaction(() => operation(session), {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      maxCommitTimeMS: 5000,
      timeoutMS: 15000,
    });
  } finally {
    await session.endSession();
  }
};
