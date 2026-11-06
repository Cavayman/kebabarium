import type { LoginResponse } from '@kebabarium/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { googleJwks, verifyGoogleIdToken } from '../auth/google';
import { requireUser } from '../auth/middleware';
import { clearSession, issueSession } from '../auth/session';
import { getUserById, isNicknameTaken, toMe, updateProfile, upsertGoogleUser } from '../db/users';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { body } from '../validate';

export const authRoutes = new Hono<AppEnv>();

export const NICKNAME_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;

const isAdminEmail = (list: string | undefined, email: string) =>
  (list ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());

async function suggestNickname(db: D1Database, given: string | undefined): Promise<string | null> {
  const base = (given ?? '').toLowerCase().replace(/[^\p{L}\p{N}_.-]/gu, '').slice(0, 20);
  if (base.length < 3) return null;
  if (!(await isNicknameTaken(db, base))) return base;
  for (let i = 2; i < 100; i++) if (!(await isNicknameTaken(db, `${base}${i}`))) return `${base}${i}`;
  return null;
}

authRoutes.post('/auth/google', async (c) => {
  const { credential } = await body(c, z.object({ credential: z.string().min(10).max(4096) }));
  const p = await verifyGoogleIdToken(credential, c.env.GOOGLE_OAUTH_CLIENT_ID, googleJwks(c.env));
  const user = await upsertGoogleUser(c.env.DB, {
    sub: p.sub,
    email: p.email,
    firstName: p.given_name ?? null,
    lastName: p.family_name ?? null,
    avatarUrl: p.picture ?? null,
    role: isAdminEmail(c.env.ADMIN_EMAILS, p.email) ? 'admin' : 'user',
  });
  await issueSession(c, user.id);
  const res: LoginResponse = {
    me: toMe(user),
    needsNickname: user.nickname == null,
    suggestedNickname: user.nickname == null ? await suggestNickname(c.env.DB, p.given_name) : null,
  };
  return c.json(res);
});

authRoutes.post('/auth/logout', (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const u = c.get('user');
  const row = u ? await getUserById(c.env.DB, u.id) : null;
  return c.json(row ? toMe(row) : null, 200, { 'Cache-Control': 'no-store' });
});

const profileSchema = z.object({
  nickname: z.string().regex(NICKNAME_RE, 'nickname must be 3–24 letters, digits, _ . -').optional(),
  showRealName: z.boolean().optional(),
  hideFromLeaderboard: z.boolean().optional(),
  lang: z.enum(['uk', 'en']).optional(),
});

authRoutes.patch('/me', requireUser, async (c) => {
  const patch = await body(c, profileSchema);
  const id = c.get('user')!.id;
  if (patch.nickname && (await isNicknameTaken(c.env.DB, patch.nickname, id))) {
    throw new ApiError(409, 'nickname_taken', 'Nickname is taken');
  }
  await updateProfile(c.env.DB, id, patch);
  return c.json(toMe((await getUserById(c.env.DB, id))!));
});
