import 'server-only';

import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(pbkdf2);
// Deployed Workers cap native PBKDF2 at 100,000 iterations; local workerd does not enforce that cap.
const iterations = 100000;

export const randomToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const hashPassword = async (password: string) => {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${salt}$${hash.toString('hex')}`;
};

export const verifyPassword = async (password: string, stored: string) => {
  const [algorithm, count, salt, expected, ...extra] = stored.split('$');
  if (extra.length || algorithm !== 'pbkdf2-sha256' || count !== String(iterations)
    || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{64}$/.test(expected ?? '')) return false;
  const actual = await derive(password, salt, iterations, 32, 'sha256');
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
};

// Same KDF cost for an unknown account; this value is never an account credential.
export const dummyPasswordHash = `pbkdf2-sha256$${iterations}$${'0'.repeat(32)}$${'0'.repeat(64)}`;
