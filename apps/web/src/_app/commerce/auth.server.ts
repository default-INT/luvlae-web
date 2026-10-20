import 'server-only';

import { ObjectId } from 'mongodb';

import { fail } from '@/shared/lib/api/index.server';
import { dummyPasswordHash, hashToken, randomToken, verifyPassword } from '@/shared/lib/security/index.server';

import { collections } from './collections.server';

import type { Db } from 'mongodb';

const cookieName = 'luvlae_admin_v2';
const sessionSeconds = 8 * 60 * 60;

export const sessionCookie = (token: string, request: Request, clear = false) => {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : sessionSeconds}${secure}`;
};

const getToken = (request: Request) => {
  const token = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);

  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
};

export const requireSessionCookie = (request: Request) => {
  if (!getToken(request)) fail(401, 'UNAUTHORIZED', 'Sign in to continue.');
};

export const requireAdmin = async (db: Db, request: Request) => {
  const token = getToken(request);

  if (!token) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');

  const { sessions, users } = collections(db);

  const session = await sessions.findOne({
    tokenHash: hashToken(token), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() },
  });

  if (!session) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');

  const user = await users.findOne({
    _id: session.adminUserId, status: 'active', sessionVersion: session.sessionVersion,
  });

  if (!user) return fail(401, 'UNAUTHORIZED', 'Sign in to continue.');

  return user;
};

const throttle = async (db: Db, key: string, max: number, windowSeconds: number) => {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const limits = db.collection<{ _id: string; count: number; expiresAt: Date }>('loginLimits');
  const filter = { _id: `${key}:${bucket}` };
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000);

  // Separate upsert/increment avoids losing increments during concurrent first requests.
  try {
    await limits.updateOne(filter, { $setOnInsert: { count: 1, expiresAt } }, { upsert: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 11000) throw error;
  }

  const result = await limits.findOneAndUpdate(filter, { $inc: { count: 1 } }, { returnDocument: 'after' });

  if (!result || result.count > max + 1) fail(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
};

export const login = async (db: Db, email: string, password: string, request: Request) => {
  await throttle(db, 'global', 100, 60);
  await throttle(db, hashToken(email), 10, 900);
  const { users, sessions } = collections(db);
  const user = await users.findOne({ emailNormalized: email });
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);

  if (!user || user.status !== 'active' || !valid) return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

  const token = randomToken();
  const now = new Date();
  const previous = getToken(request);

  if (previous) await sessions.updateOne({ tokenHash: hashToken(previous) }, { $set: { revokedAt: now } });

  await sessions.insertOne({
    _id: new ObjectId(), schemaVersion: 1, adminUserId: user._id, tokenHash: hashToken(token),
    sessionVersion: user.sessionVersion, createdAt: now, expiresAt: new Date(now.getTime() + sessionSeconds * 1000),
  });
  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
  return { token, user: { id: user._id.toHexString(), email: user.email } };
};

export const logout = async (db: Db, request: Request) => {
  const token = getToken(request);

  if (token) await collections(db).sessions.updateOne({ tokenHash: hashToken(token) }, { $set: { revokedAt: new Date() } });
};
