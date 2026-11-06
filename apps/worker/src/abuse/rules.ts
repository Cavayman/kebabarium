import { ABUSE } from './config';
import { contentFlags } from './content';
import type { Identity } from './identity';

export interface ReviewContext {
  placeId: number;
  district: string | null;
  chainId: number | null;
  stars: number;
  text: string | null;
  nickname: string | null;
  identity: Identity;
  now: Date;
}

export type Decision =
  | { decision: 'reject'; status: 403 | 429; code: 'banned' | 'cooldown' | 'rate_limited'; retryAfterSec: number }
  | { decision: 'accept'; status: 'pending' | 'published' | 'held'; reasons: string[]; flagIds: number[]; publishAt: string | null };

const iso = (d: Date) => d.toISOString();
const ago = (now: Date, ms: number) => iso(new Date(now.getTime() - ms));
const H = 3600 * 1000;
const D = 24 * H;
const secsUntil = (fromIso: string, windowMs: number, now: Date) =>
  Math.max(1, Math.ceil((Date.parse(fromIso) + windowMs - now.getTime()) / 1000));

/** SQL `(device_id = ? OR ip_hash = ? [OR user_id = ?])` for "the same person" (spec §8b.2). */
function sameIdentity(id: Identity): { sql: string; args: unknown[] } {
  const parts = ['device_id = ?', 'ip_hash = ?'];
  const args: unknown[] = [id.deviceId, id.ipHash];
  if (id.userId) {
    parts.push('user_id = ?');
    args.push(id.userId);
  }
  return { sql: `(${parts.join(' OR ')})`, args };
}

export async function evaluate(db: D1Database, ctx: ReviewContext): Promise<Decision> {
  const { identity: id, now } = ctx;
  const anon = id.userId == null;

  // 1. bans
  const ban = await db
    .prepare(
      `SELECT id FROM abuse_bans WHERE (until IS NULL OR until > ?) AND (
         (kind = 'ip_prefix' AND value_hash = ?) OR (kind = 'device' AND value_hash = ?) OR (kind = 'user' AND value_hash = ?)
       ) LIMIT 1`,
    )
    .bind(iso(now), id.ipPrefixHash, id.deviceId, id.userId ? String(id.userId) : '-')
    .first();
  if (ban) return { decision: 'reject', status: 403, code: 'banned', retryAfterSec: 0 };

  // 2. per-place cooldown (logged-in edits of their own rating never reach here)
  const same = sameIdentity(id);
  const last = await db
    .prepare(
      `SELECT MAX(created_at) AS at FROM ratings WHERE place_id = ? AND status != 'hidden' AND created_at > ? AND ${same.sql}`,
    )
    .bind(ctx.placeId, ago(now, ABUSE.cooldownDays * D), ...same.args)
    .first<{ at: string | null }>();
  if (last?.at) return { decision: 'reject', status: 429, code: 'cooldown', retryAfterSec: secsUntil(last.at, ABUSE.cooldownDays * D, now) };

  // 3. rate limits
  if (anon) {
    for (const [windowMs, max] of [
      [H, ABUSE.anonPerHour],
      [D, ABUSE.anonPerDay],
    ] as const) {
      const r = await db
        .prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS first FROM ratings WHERE ip_prefix_hash = ? AND created_at > ?`)
        .bind(id.ipPrefixHash, ago(now, windowMs))
        .first<{ n: number; first: string | null }>();
      if (r && r.n >= max) return { decision: 'reject', status: 429, code: 'rate_limited', retryAfterSec: secsUntil(r.first!, windowMs, now) };
    }
  } else {
    const r = await db
      .prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS first FROM ratings WHERE user_id = ? AND created_at > ?`)
      .bind(id.userId, ago(now, D))
      .first<{ n: number; first: string | null }>();
    if (r && r.n >= ABUSE.userPerDay) return { decision: 'reject', status: 429, code: 'rate_limited', retryAfterSec: secsUntil(r.first!, D, now) };
  }

  // 4–6. reasons to hold for moderation
  const reasons: string[] = [...contentFlags(ctx.text, ctx.nickname)];
  let flagIds: number[] = [];

  if (anon) {
    const burst = await db
      .prepare(`SELECT COUNT(*) AS n FROM ratings WHERE place_id = ? AND is_anonymous = 1 AND created_at > ?`)
      .bind(ctx.placeId, ago(now, H))
      .first<{ n: number }>();
    if ((burst?.n ?? 0) >= ABUSE.burstAnonPerPlacePerHour) reasons.push('burst');
  }

  const pattern = await haterPattern(db, ctx);
  if (pattern) {
    reasons.push('hater');
    flagIds = pattern;
  }

  if (reasons.length) return { decision: 'accept', status: 'held', reasons, flagIds, publishAt: null };
  if (anon) return { decision: 'accept', status: 'pending', reasons, flagIds, publishAt: iso(new Date(now.getTime() + ABUSE.softPublishMin * 60 * 1000)) };
  return { decision: 'accept', status: 'published', reasons, flagIds, publishAt: null };
}

/**
 * ≤2★ to ≥3 places of one district or chain within 24 h by one identity/network, or ≥3 × 5★ to one chain.
 * Returns the earlier rating ids to re-flag, or null.
 */
async function haterPattern(db: D1Database, ctx: ReviewContext): Promise<number[] | null> {
  const low = ctx.stars <= ABUSE.haterLowStars;
  const boost = ctx.stars === 5 && ctx.chainId != null;
  if (!low && !boost) return null;
  const id = ctx.identity;
  const who = ['r.device_id = ?', 'r.ip_prefix_hash = ?'];
  const args: unknown[] = [id.deviceId, id.ipPrefixHash];
  if (id.userId) {
    who.push('r.user_id = ?');
    args.push(id.userId);
  }
  const { results } = await db
    .prepare(
      `SELECT r.id, r.place_id AS placeId, r.stars, p.district, p.chain_id AS chainId FROM ratings r JOIN places p ON p.id = r.place_id
       WHERE r.created_at > ? AND r.status != 'hidden' AND r.place_id != ? AND (${who.join(' OR ')})`,
    )
    .bind(ago(ctx.now, ABUSE.haterWindowH * H), ctx.placeId, ...args)
    .all<{ id: number; placeId: number; stars: number; district: string | null; chainId: number | null }>();

  const groups: Array<(r: (typeof results)[number]) => boolean> = [];
  if (low && ctx.district) groups.push((r) => r.stars <= ABUSE.haterLowStars && r.district === ctx.district);
  if (low && ctx.chainId) groups.push((r) => r.stars <= ABUSE.haterLowStars && r.chainId === ctx.chainId);
  if (boost) groups.push((r) => r.stars === 5 && r.chainId === ctx.chainId);

  for (const match of groups) {
    const hits = results.filter(match);
    if (new Set(hits.map((h) => h.placeId)).size + 1 >= ABUSE.haterMinPlaces) return hits.map((h) => h.id);
  }
  return null;
}
