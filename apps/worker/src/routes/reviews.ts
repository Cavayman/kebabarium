import type { PlaceSummary, ReviewItem, ReviewResult } from '@kebabarium/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { ABUSE } from '../abuse/config';
import { contentFlags } from '../abuse/content';
import { identity } from '../abuse/identity';
import { evaluate } from '../abuse/rules';
import { verifyTurnstile } from '../abuse/turnstile';
import { requireUser } from '../auth/middleware';
import { getPlace } from '../db/places';
import { findUserRating, insertRating, setRatingStatus, updateRatingWithHistory } from '../db/ratings';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { loadCityPlaces } from '../services/places';
import { body } from '../validate';

export const reviewRoutes = new Hono<AppEnv>();

const text = z
  .string()
  .max(ABUSE.maxText)
  .transform((s) => s.trim() || null)
  .optional();

const reviewSchema = z.object({
  stars: z.number().int().min(1).max(5),
  text,
  nickname: z
    .string()
    .max(24)
    .transform((s) => s.trim() || null)
    .optional(),
  turnstileToken: z.string().max(4096).optional(),
});

const ratingSchema = z.object({ stars: z.number().int().min(1).max(5), text });

const placeId = (raw: string | undefined) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'validation_error', 'Invalid place id');
  return id;
};

async function openPlace(db: D1Database, id: number) {
  const place = await getPlace(db, id);
  if (!place || place.status === 'hidden') throw new ApiError(404, 'place_not_found', 'Place not found');
  if (place.status === 'dead') throw new ApiError(409, 'place_closed', 'This place is closed');
  return place;
}

reviewRoutes.post('/places/:id/reviews', async (c) => {
  const id = placeId(c.req.param('id'));
  const input = await body(c, reviewSchema);
  const place = await openPlace(c.env.DB, id);
  const who = await identity(c);
  const db = c.env.DB;

  if (who.userId == null) {
    const ok = await verifyTurnstile(input.turnstileToken, c.env.TURNSTILE_SECRET, who.ip, c.env.ENVIRONMENT);
    if (!ok) throw new ApiError(403, 'turnstile_failed', 'Bot check failed');
  } else {
    const own = await findUserRating(db, id, who.userId);
    if (own) {
      const flags = contentFlags(input.text);
      const status = flags.length ? 'held' : own.status === 'held' ? 'held' : 'published';
      await updateRatingWithHistory(db, own, { stars: input.stars, text: input.text ?? null, status, holdReasons: flags });
      return c.json<ReviewResult>({ id: own.id, status: 'published' }, 201);
    }
  }

  const d = await evaluate(db, {
    placeId: id,
    district: place.district,
    chainId: place.chainId,
    stars: input.stars,
    text: input.text ?? null,
    nickname: input.nickname ?? null,
    identity: who,
    now: new Date(),
  });
  if (d.decision === 'reject') {
    const msg = { banned: 'You cannot post reviews', cooldown: 'Already reviewed recently', rate_limited: 'Too many reviews' }[d.code];
    throw new ApiError(d.status, d.code, msg, d.retryAfterSec ? { retryAfterSec: d.retryAfterSec } : {});
  }

  const anon = who.userId == null;
  const newId = await insertRating(db, {
    placeId: id,
    userId: who.userId,
    nickname: anon ? (input.nickname ?? null) : null,
    stars: input.stars,
    text: input.text ?? null,
    isAnonymous: anon,
    weight: anon ? ABUSE.anonWeight : ABUSE.userWeight,
    status: d.status,
    holdReasons: d.reasons,
    publishAt: d.publishAt,
    ipHash: who.ipHash,
    ipPrefixHash: who.ipPrefixHash,
    deviceId: who.deviceId,
  });
  await setRatingStatus(db, d.flagIds, 'held', 'hater');

  // Held reviews look pending to their author (spec §8b.8).
  const visible: ReviewResult['status'] = d.status === 'published' ? 'published' : 'pending';
  return c.json<ReviewResult>({ id: newId, status: visible }, 201);
});

reviewRoutes.put('/places/:id/rating', requireUser, async (c) => {
  const id = placeId(c.req.param('id'));
  const input = await body(c, ratingSchema);
  const own = await findUserRating(c.env.DB, id, c.get('user')!.id);
  if (!own) throw new ApiError(404, 'rating_not_found', 'You have not rated this place');
  const flags = contentFlags(input.text);
  await updateRatingWithHistory(c.env.DB, own, {
    stars: input.stars,
    text: input.text ?? null,
    status: flags.length || own.status === 'held' ? 'held' : 'published',
    holdReasons: flags,
  });
  return c.json<ReviewResult>({ id: own.id, status: 'published' });
});

reviewRoutes.delete('/places/:id/rating', requireUser, async (c) => {
  const id = placeId(c.req.param('id'));
  const own = await findUserRating(c.env.DB, id, c.get('user')!.id);
  if (!own) throw new ApiError(404, 'rating_not_found', 'You have not rated this place');
  await setRatingStatus(c.env.DB, [own.id], 'hidden', 'deleted_by_author');
  return c.body(null, 204);
});

reviewRoutes.get('/me/ratings', requireUser, async (c) => {
  const userId = c.get('user')!.id;
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.stars, r.text, r.place_id AS placeId, p.name AS placeName, p.city_id AS cityId, r.updated_at AS createdAt, r.status
     FROM ratings r JOIN places p ON p.id = r.place_id
     WHERE r.user_id = ? AND r.status != 'hidden' ORDER BY r.updated_at DESC`,
  )
    .bind(userId)
    .all<{ id: number; stars: number; text: string | null; placeId: number; placeName: string; cityId: number; createdAt: string; status: string }>();

  const summaries = new Map<number, PlaceSummary & { raw: number | null }>();
  for (const cityId of new Set(results.map((r) => r.cityId))) {
    for (const p of await loadCityPlaces(c.env.DB, cityId)) summaries.set(p.row.id, { ...p.summary, raw: p.combined });
  }
  const history: Array<ReviewItem & { status: string }> = results.map((r) => ({
    id: `r${r.id}`,
    source: 'ours',
    author: '',
    stars: r.stars,
    text: r.text,
    placeId: r.placeId,
    placeName: r.placeName,
    createdAt: r.createdAt,
    status: r.status,
    ...(r.status === 'published' ? {} : { ownPending: true }),
  }));
  const top = results
    .map((r) => ({ ...summaries.get(r.placeId)!, myStars: r.stars }))
    .sort((a, b) => b.myStars - a.myStars || (b.raw ?? -1) - (a.raw ?? -1))
    .map(({ raw: _raw, ...p }) => p);
  return c.json({ history, top, count: results.length }, 200, { 'Cache-Control': 'no-store' });
});
