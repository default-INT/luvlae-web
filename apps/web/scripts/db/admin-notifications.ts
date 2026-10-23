import nextEnv from '@next/env';
import { z } from 'zod';

import { ApiError } from '../../src/shared/lib/api/index.server';
import { createDatabaseClient } from '../../src/shared/lib/mongodb/index.server';

const run = async () => {
  nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

  if (!process.env.NEXT_MONGODB_DB_NAME || process.env.DB_CONFIRM_NAME !== process.env.NEXT_MONGODB_DB_NAME) {
    throw new ApiError(400, 'DB_CONFIRMATION_REQUIRED', 'Set DB_CONFIRM_NAME to the exact configured database name.');
  }

  const email = z.email().max(254).parse(process.env.ADMIN_EMAIL?.trim().toLowerCase());
  const enabled = z.enum(['true', 'false']).parse(process.env.ADMIN_NOTIFY_ORDERS);
  const context = createDatabaseClient();

  try {
    await context.client.connect();

    if (!await context.db.collection('_migrations').findOne({ name: '007-admin-notifications' })) {
      throw new ApiError(503, 'DATABASE_NOT_READY', 'Run db:migrate before changing notification preferences.');
    }

    const result = await context.db.collection('adminUsers').updateOne({ emailNormalized: email }, {
      $set: { 'notify.orders': enabled === 'true', updatedAt: new Date() },
    });

    if (!result.matchedCount) throw new ApiError(404, 'ADMIN_NOT_FOUND', 'Administrator does not exist.');

    console.log('Administrator order notification preference updated.');
  } finally {
    await context.client.close();
  }
};

run().catch(error => {
  console.error('Notification preference update failed.', { code: error instanceof ApiError ? error.code : 'INVALID_INPUT' });
  process.exitCode = 1;
});
