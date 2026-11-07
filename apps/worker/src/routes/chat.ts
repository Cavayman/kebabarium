import { CHAT_MAX_TEXT, type ChatMessage, type ChatResponse } from '@kebabarium/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { isBanned } from '../abuse/rules';
import { identity } from '../abuse/identity';
import { requireUser } from '../auth/middleware';
import { getCityBySlug, type CityRow } from '../db/cities';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { body } from '../validate';

export const chatRoutes = new Hono<AppEnv>();

/** Seconds a user waits between two messages, and how many messages a minute they may send at most. */
export const CHAT = { cooldownSec: 3, perMinute: 10, page: 50, maxAfter: 100 } as const;

const LINK = /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|ua|ru|io|me|info|xyz|top|link|shop|site|online)\b)/i;

/** Public name: real name on opt-in, otherwise the nickname; null when the user has neither. */
export const CHAT_AUTHOR_SQL = `CASE
  WHEN u.show_real_name = 1 AND u.first_name IS NOT NULL THEN TRIM(u.first_name || ' ' || COALESCE(u.last_name, ''))
  ELSE u.nickname END`;

const SELECT = `SELECT m.id, ${CHAT_AUTHOR_SQL} AS author, m.text, m.created_at AS createdAt, m.user_id AS userId
  FROM chat_messages m JOIN users u ON u.id = m.user_id`;

type Row = Omit<ChatMessage, 'own'> & { userId: number };
const toMessage = (r: Row, viewer: number | null): ChatMessage => ({ id: r.id, author: r.author ?? '—', text: r.text, createdAt: r.createdAt, own: r.userId === viewer });

async function city(c: Context<AppEnv>): Promise<CityRow> {
  const row = await getCityBySlug(c.env.DB, c.req.param('slug')!);
  if (!row || !row.active) throw new ApiError(404, 'city_not_found', 'City not found');
  return row;
}

async function publicName(db: D1Database, userId: number): Promise<string | null> {
  const r = await db.prepare(`SELECT ${CHAT_AUTHOR_SQL} AS n FROM users u WHERE u.id = ?`).bind(userId).first<{ n: string | null }>();
  return r?.n?.trim() || null;
}

chatRoutes.get('/cities/:slug/chat', async (c) => {
  const room = await city(c);
  const viewer = c.get('user')?.id ?? null;
  const after = Number(c.req.query('after'));
  const db = c.env.DB;
  const rows = Number.isInteger(after) && after > 0
    ? (await db.prepare(`${SELECT} WHERE m.city_id = ? AND m.status = 'visible' AND m.id > ? ORDER BY m.id LIMIT ?`).bind(room.id, after, CHAT.maxAfter).all<Row>()).results
    : (await db.prepare(`${SELECT} WHERE m.city_id = ? AND m.status = 'visible' ORDER BY m.id DESC LIMIT ?`).bind(room.id, CHAT.page).all<Row>()).results.reverse();
  const canPost = viewer != null && (await publicName(db, viewer)) != null && !(await isBanned(db, await identity(c)));
  const res: ChatResponse = { items: rows.map((r) => toMessage(r, viewer)), canPost };
  return c.json(res, 200, { 'Cache-Control': 'no-store' });
});

const messageSchema = z.object({
  text: z
    .string()
    .max(CHAT_MAX_TEXT)
    .transform((s) => s.replace(/\s+/g, ' ').trim())
    .refine((s) => s.length > 0, 'Empty message'),
});

chatRoutes.post('/cities/:slug/chat', requireUser, async (c) => {
  const room = await city(c);
  const { text } = await body(c, messageSchema);
  const userId = c.get('user')!.id;
  const db = c.env.DB;

  if (await isBanned(db, await identity(c))) throw new ApiError(403, 'banned', 'You cannot post');
  if (!(await publicName(db, userId))) throw new ApiError(409, 'nickname_required', 'Pick a nickname first');
  if (LINK.test(text)) throw new ApiError(422, 'links_not_allowed', 'Links are not allowed in the chat');

  const now = Date.now();
  const recent = await db
    .prepare(`SELECT MAX(created_at) AS last, COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND created_at > ?`)
    .bind(userId, new Date(now - 60_000).toISOString())
    .first<{ last: string | null; n: number }>();
  if (recent?.last && now - Date.parse(recent.last) < CHAT.cooldownSec * 1000) {
    throw new ApiError(429, 'chat_cooldown', 'Slow down a little', { retryAfterSec: CHAT.cooldownSec });
  }
  if ((recent?.n ?? 0) >= CHAT.perMinute) throw new ApiError(429, 'rate_limited', 'Too many messages', { retryAfterSec: 60 });

  const row = await db
    .prepare(`INSERT INTO chat_messages (city_id, user_id, text) VALUES (?, ?, ?) RETURNING id`)
    .bind(room.id, userId, text)
    .first<{ id: number }>();
  const created = await db.prepare(`${SELECT} WHERE m.id = ?`).bind(row!.id).first<Row>();
  return c.json(toMessage(created!, userId), 201);
});
