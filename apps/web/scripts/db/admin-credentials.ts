import { z } from 'zod';

import { ApiError } from '../../src/shared/lib/api/index.server';

export const readAdminCredentials = (environment: { ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string }) => {
  const email = environment.ADMIN_EMAIL?.trim().toLowerCase();
  const password = environment.ADMIN_PASSWORD;

  if (!email) throw new ApiError(400, 'ADMIN_EMAIL_REQUIRED', 'Set ADMIN_EMAIL in the app environment.');

  if (!z.email().max(254).safeParse(email).success) {
    throw new ApiError(400, 'INVALID_ADMIN_EMAIL', 'ADMIN_EMAIL must be a valid email address (at most 254 characters).');
  }

  if (!password) throw new ApiError(400, 'ADMIN_PASSWORD_REQUIRED', 'Set ADMIN_PASSWORD in the app environment.');

  if (password.length < 15) {
    throw new ApiError(400, 'ADMIN_PASSWORD_TOO_SHORT', 'ADMIN_PASSWORD must contain at least 15 characters.');
  }

  if (password.length > 256) {
    throw new ApiError(400, 'ADMIN_PASSWORD_TOO_LONG', 'ADMIN_PASSWORD must contain at most 256 characters.');
  }

  return { email, password };
};
