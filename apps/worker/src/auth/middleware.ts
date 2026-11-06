import type { MiddlewareHandler } from 'hono';
import { getUserById } from '../db/users';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { readSession } from './session';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Same-origin SPA marker header; browsers can't send it cross-site without a CORS preflight, which we never allow. */
export const csrfGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (MUTATING.has(c.req.method) && c.req.header('X-Requested-With') !== 'kebabarium') {
    throw new ApiError(403, 'csrf', 'Missing X-Requested-With header');
  }
  await next();
};

export const withUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const s = await readSession(c);
  const user = s ? await getUserById(c.env.DB, s.userId) : null;
  c.set('user', user ? { id: user.id, role: user.role } : null);
  await next();
};

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) throw new ApiError(401, 'unauthenticated', 'Sign in first');
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const u = c.get('user');
  if (!u) throw new ApiError(401, 'unauthenticated', 'Sign in first');
  if (u.role !== 'admin') throw new ApiError(403, 'forbidden', 'Admins only');
  await next();
};
