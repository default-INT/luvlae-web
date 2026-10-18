import nextEnv from '@next/env';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { collections } from '../../src/_app/commerce/collections.server';
import { migrateCommerce } from '../../src/_app/commerce/migrations.server';
import { seedTestProduct } from '../../src/_app/commerce/mock-migration.server';
import { requireMockCheckout } from '../../src/_app/commerce/mock-checkout.server';
import { ApiError } from '../../src/shared/lib/api/index.server';
import { createDatabaseClient, inTransaction } from '../../src/shared/lib/mongodb/index.server';
import { hashPassword } from '../../src/shared/lib/security/index.server';

import { readAdminCredentials } from './admin-credentials';

nextEnv.loadEnvConfig(process.cwd());

const run = async () => {
  const command = process.argv[2];
  if (!['migrate', 'seed:test', 'check', 'admin:create', 'admin:reset-password'].includes(command)) {
    throw new ApiError(400, 'INVALID_COMMAND', 'Use migrate, seed:test, check, admin:create, or admin:reset-password.');
  }
  // Prevent accidental operations against a different environment/database.
  if (!process.env.NEXT_MONGODB_DB_NAME) {
    throw new ApiError(400, 'DATABASE_NOT_CONFIGURED', 'Set NEXT_MONGODB_DB_NAME in the app environment.');
  }
  if (!process.env.DB_CONFIRM_NAME || process.env.DB_CONFIRM_NAME !== process.env.NEXT_MONGODB_DB_NAME) {
    throw new ApiError(400, 'DB_CONFIRMATION_REQUIRED',
      'Set DB_CONFIRM_NAME to exactly the same value as NEXT_MONGODB_DB_NAME before running this command.');
  }
  const credentialEnvironment = { ADMIN_EMAIL: process.env.ADMIN_EMAIL, ADMIN_PASSWORD: process.env.ADMIN_PASSWORD };
  const credentials = command.startsWith('admin:') ? readAdminCredentials(credentialEnvironment) : undefined;
  const context = createDatabaseClient();
  try {
    await context.client.connect();
    if (command === 'migrate') {
      await migrateCommerce(context.db);
    } else {
      const migration = await context.db.collection('_migrations').findOne({ name: '001-commerce' });
      if (!migration) throw new ApiError(503, 'DATABASE_NOT_READY', 'Run db:migrate before this command.');
      if (command === 'seed:test') {
        requireMockCheckout();
        await migrateCommerce(context.db);
        await seedTestProduct(context);
      } else if (command === 'check') {
        // A write in an aborted transaction proves transaction support without retaining probe data.
        const session = context.client.startSession();
        const probe = new ObjectId();
        try {
          session.startTransaction();
          await context.db.collection('_databaseProbes').insertOne({ _id: probe }, { session });
          await session.abortTransaction();
          if (await context.db.collection('_databaseProbes').findOne({ _id: probe })) {
            throw new ApiError(500, 'ROLLBACK_CHECK_FAILED', 'The database rollback check failed.');
          }
        } finally {
          await session.endSession();
        }
      } else {
        const { email, password } = credentials ?? readAdminCredentials(credentialEnvironment);
        const passwordHash = await hashPassword(password);
        const now = new Date();
        const { users, sessions } = collections(context.db);

        if (command === 'admin:create') {
          await users.insertOne({
            _id: new ObjectId(), schemaVersion: 1, email, emailNormalized: email, passwordHash,
            status: 'active', sessionVersion: 1, passwordChangedAt: now, createdAt: now, updatedAt: now,
          });
        } else {
          await inTransaction(context, async session => {
            const user = await users.findOne({ emailNormalized: email }, { session });
            if (!user) throw new ApiError(404, 'ADMIN_NOT_FOUND', 'Administrator does not exist.');
            await users.updateOne({ _id: user._id }, {
              $set: { passwordHash, passwordChangedAt: now, updatedAt: now }, $inc: { sessionVersion: 1 },
            }, { session });
            await sessions.updateMany({ adminUserId: user._id }, { $set: { revokedAt: now } }, { session });
          });
        }
      }
    }
    console.log(`Completed: ${command}`);
  } finally {
    await context.client.close();
  }
};

run().catch(error => {
  // Errors can contain credentials/PII. Surface operation failure without dumping driver/validation payloads.
  const code = error instanceof Error && 'code' in error ? error.code : 'COMMAND_FAILED';
  console.error('Database command failed.', { code });
  if (error instanceof ApiError) {
    console.error(error.message);
  } else if (error instanceof z.ZodError) {
    console.error('Check ADMIN_EMAIL and ADMIN_PASSWORD (15–256 characters).');
  } else {
    console.error('Check connectivity and permissions. Migrations require createIndex/createCollection/collMod.');
  }
  process.exitCode = 1;
});
