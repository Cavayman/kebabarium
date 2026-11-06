import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { jwtVerify, SignJWT } from 'jose';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';

export const SESSION_COOKIE = 'kb_session';
const MAX_AGE = 60 * 60 * 24 * 30;

const key = (secret: string | undefined) => {
  if (!secret) throw new ApiError(503, 'auth_not_configured', 'SESSION_SECRET missing');
  return new TextEncoder().encode(secret);
};

export async function issueSession(c: Context<AppEnv>, userId: number): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key(c.env.SESSION_SECRET));
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: MAX_AGE });
}

export async function readSession(c: Context<AppEnv>): Promise<{ userId: number } | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !c.env.SESSION_SECRET) return null;
  try {
    const { payload } = await jwtVerify(token, key(c.env.SESSION_SECRET), { algorithms: ['HS256'] });
    const userId = Number(payload.sub);
    return Number.isInteger(userId) ? { userId } : null;
  } catch {
    return null;
  }
}

export function clearSession(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure: true });
}
