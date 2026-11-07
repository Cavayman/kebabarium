import { Hono } from 'hono';
import { z } from 'zod';
import { requireAdmin } from '../auth/middleware';
import { getBudgetUsage } from '../db/budget';
import { getCityBySlug } from '../db/cities';
import { getPlace, PLACE_SELECT, mapPlace } from '../db/places';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { CAPS, SYNC, SYNC_KINDS } from '../sync/config';
import { runDiscovery } from '../sync/discovery';
import { runRefresh } from '../sync/refresh';
import { newStats } from '../sync/stats';
import { finishSyncRun, runSync, startSyncRun, SYNC_RUN_SELECT } from '../sync/run';
import { body } from '../validate';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('/admin/*', requireAdmin);

const PAGE = 50;
const intParam = (v: string | undefined, name: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, 'validation_error', `Invalid ${name}`);
  return n;
};
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '');

// ---------- overview ----------
/** Per-city numbers for the admin overview, all counted from the data. */
adminRoutes.get('/admin/overview', async (c) => {
  const city = await getCityBySlug(c.env.DB, c.req.query('city') ?? 'lviv');
  if (!city) throw new ApiError(404, 'city_not_found', 'City not found');
  const db = c.env.DB;
  const [places, ours, ext, runs] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS total, COALESCE(SUM(status = 'open'), 0) AS open, COALESCE(SUM(status = 'closed_temp'), 0) AS closedTemp,
           COALESCE(SUM(status = 'dead'), 0) AS dead, COALESCE(SUM(status = 'hidden'), 0) AS hidden,
           COALESCE(SUM(status != 'hidden' AND google_rating IS NULL), 0) AS unrated, COALESCE(SUM(dead_candidate = 1), 0) AS deadCandidates
         FROM places WHERE city_id = ?`,
      )
      .bind(city.id),
    db
      .prepare(
        `SELECT COALESCE(SUM(r.status = 'published'), 0) AS published, COALESCE(SUM(r.status = 'pending'), 0) AS pending,
           COALESCE(SUM(r.status = 'held'), 0) AS held
         FROM ratings r JOIN places p ON p.id = r.place_id WHERE p.city_id = ?`,
      )
      .bind(city.id),
    db
      .prepare(`SELECT COALESCE(SUM(source = 'google'), 0) AS google, COALESCE(SUM(source = 'threads'), 0) AS threads FROM external_reviews WHERE city_id = ?`)
      .bind(city.id),
    db.prepare(`SELECT MAX(finished_at) AS lastSyncAt, MAX(CASE WHEN kind = 'scan' THEN finished_at END) AS lastScanAt FROM sync_runs`),
  ]);
  const first = <T>(r: D1Result | undefined) => (r!.results[0] ?? {}) as T;
  return c.json({
    city: { slug: city.slug, name: city.name },
    places: first<Record<string, number>>(places),
    reviews: { ...first<Record<string, number>>(ours), ...first<Record<string, number>>(ext) },
    ...first<{ lastSyncAt: string | null; lastScanAt: string | null }>(runs),
  });
});

// ---------- places ----------
/** Admin list orders; NULLs (unrated) always last. */
const PLACE_SORTS: Record<string, string> = {
  name: 'p.name',
  rating: 'p.google_rating IS NULL, p.google_rating DESC, p.google_rating_count DESC, p.name',
  reviews: 'p.google_rating_count IS NULL, p.google_rating_count DESC, p.name',
  newest: 'p.id DESC',
  seen: 'p.last_seen_at IS NULL, p.last_seen_at, p.name',
};

adminRoutes.get('/admin/places', async (c) => {
  const city = await getCityBySlug(c.env.DB, c.req.query('city') ?? 'lviv');
  if (!city) throw new ApiError(404, 'city_not_found', 'City not found');
  const where = ['p.city_id = ?'];
  const args: unknown[] = [city.id];
  const status = c.req.query('status');
  if (status) where.push('p.status = ?'), args.push(status);
  if (c.req.query('deadCandidate') === '1') where.push('p.dead_candidate = 1');
  const q = c.req.query('q')?.trim().toLowerCase();
  if (q) where.push('(LOWER(p.name) LIKE ? OR p.norm_name LIKE ? OR LOWER(COALESCE(p.address, \'\')) LIKE ?)'), args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const sort = c.req.query('sort') ?? 'name';
  const order = PLACE_SORTS[sort];
  if (!order) throw new ApiError(400, 'validation_error', 'Invalid sort');
  const sqlWhere = where.join(' AND ');
  const [list, total] = await c.env.DB.batch([
    c.env.DB.prepare(`${PLACE_SELECT} WHERE ${sqlWhere} ORDER BY ${order} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`).bind(...args),
    c.env.DB.prepare(`SELECT COUNT(*) AS n FROM places p WHERE ${sqlWhere}`).bind(...args),
  ]);
  return c.json({
    items: (list!.results as Parameters<typeof mapPlace>[0][]).map(mapPlace),
    total: (total!.results[0] as { n: number }).n,
    page,
  });
});

const placePatch = z.object({
  name: z.string().min(1).max(120).optional(),
  chainId: z.number().int().positive().nullable().optional(),
  logoUrl: z.url().max(500).nullable().optional(),
  district: z.string().max(60).nullable().optional(),
  status: z.enum(['open', 'closed_temp', 'dead', 'hidden']).optional(),
  deadCandidate: z.boolean().optional(),
});

adminRoutes.patch('/admin/places/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const p = await body(c, placePatch);
  if (!(await getPlace(c.env.DB, id))) throw new ApiError(404, 'place_not_found', 'Place not found');
  const cols: Record<string, string> = {
    name: 'name',
    chainId: 'chain_id',
    logoUrl: 'logo_url',
    district: 'district',
    status: 'status',
    deadCandidate: 'dead_candidate',
  };
  const sets: string[] = [];
  const args: unknown[] = [];
  for (const [k, col] of Object.entries(cols)) {
    const v = (p as Record<string, unknown>)[k];
    if (v === undefined) continue;
    sets.push(`${col} = ?`);
    args.push(typeof v === 'boolean' ? (v ? 1 : 0) : v);
  }
  if (p.status && p.status !== 'dead') sets.push('dead_reason = NULL');
  if (p.status === 'dead') sets.push(`dead_reason = COALESCE(dead_reason, 'admin')`);
  if (p.name) sets.push('norm_name = ?'), args.push(p.name.toLowerCase());
  if (sets.length) {
    await c.env.DB.prepare(`UPDATE places SET ${sets.join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`)
      .bind(...args, id)
      .run();
  }
  return c.json(await getPlace(c.env.DB, id));
});

adminRoutes.post('/admin/places/:id/move-to/:otherId', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const target = intParam(c.req.param('otherId'), 'otherId');
  if (id === target) throw new ApiError(400, 'validation_error', 'A place cannot move into itself');
  const [from, to] = await Promise.all([getPlace(c.env.DB, id), getPlace(c.env.DB, target)]);
  if (!from || !to) throw new ApiError(404, 'place_not_found', 'Place not found');
  if (to.movedToPlaceId === id) throw new ApiError(400, 'validation_error', 'That would create a move loop');
  await c.env.DB.prepare(
    `UPDATE places SET status = 'dead', dead_reason = 'moved', moved_to_place_id = ?, dead_candidate = 0,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(target, id)
    .run();
  return c.json({ from: await getPlace(c.env.DB, id), to });
});

// ---------- chains ----------
adminRoutes.get('/admin/chains', async (c) => {
  const city = await getCityBySlug(c.env.DB, c.req.query('city') ?? 'lviv');
  const { results } = await c.env.DB.prepare(
    `SELECT ch.id, ch.name, ch.slug, ch.logo_url AS logoUrl, ch.city_id AS cityId,
       (SELECT COUNT(*) FROM places p WHERE p.chain_id = ch.id AND p.status != 'hidden') AS spots
     FROM chains ch WHERE ch.city_id IS NULL OR ch.city_id = ? ORDER BY ch.name`,
  )
    .bind(city?.id ?? -1)
    .all();
  return c.json(results);
});

const chainBody = z.object({
  name: z.string().min(1).max(80),
  cityId: z.number().int().positive().nullable().optional(),
  logoUrl: z.url().max(500).nullable().optional(),
});

adminRoutes.post('/admin/chains', async (c) => {
  const b = await body(c, chainBody);
  const row = await c.env.DB.prepare(
    `INSERT INTO chains (city_id, name, slug, norm_name, logo_url) VALUES (?, ?, ?, ?, ?) RETURNING id, name, slug, logo_url AS logoUrl, city_id AS cityId`,
  )
    .bind(b.cityId ?? null, b.name, slugify(b.name), b.name.toLowerCase(), b.logoUrl ?? null)
    .first();
  return c.json(row, 201);
});

adminRoutes.patch('/admin/chains/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const b = await body(c, chainBody.partial());
  await c.env.DB.prepare(
    `UPDATE chains SET name = COALESCE(?, name), norm_name = COALESCE(?, norm_name), slug = COALESCE(?, slug),
       logo_url = CASE WHEN ? THEN ? ELSE logo_url END WHERE id = ?`,
  )
    .bind(b.name ?? null, b.name?.toLowerCase() ?? null, b.name ? slugify(b.name) : null, b.logoUrl !== undefined ? 1 : 0, b.logoUrl ?? null, id)
    .run();
  return c.json(await c.env.DB.prepare(`SELECT id, name, slug, logo_url AS logoUrl, city_id AS cityId FROM chains WHERE id = ?`).bind(id).first());
});

adminRoutes.delete('/admin/chains/:id', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  await c.env.DB.batch([
    c.env.DB.prepare(`UPDATE places SET chain_id = NULL WHERE chain_id = ?`).bind(id),
    c.env.DB.prepare(`DELETE FROM chains WHERE id = ?`).bind(id),
  ]);
  return c.body(null, 204);
});

// ---------- moderation ----------
adminRoutes.get('/admin/reviews', async (c) => {
  const status = c.req.query('status') ?? 'held';
  if (!['pending', 'held'].includes(status)) throw new ApiError(400, 'validation_error', 'Invalid status');
  const page = Math.max(1, Number(c.req.query('page') ?? 1) || 1);
  const { results } = await c.env.DB.prepare(
    `SELECT r.id, r.place_id AS placeId, p.name AS placeName, r.stars, r.text, r.nickname, r.user_id AS userId, u.nickname AS userNickname,
       r.hold_reasons AS reasons, r.created_at AS createdAt, r.is_anonymous AS anon,
       SUBSTR(r.ip_prefix_hash, 1, 8) AS network, SUBSTR(r.ip_hash, 1, 8) AS ip, SUBSTR(r.device_id, 1, 8) AS device
     FROM ratings r JOIN places p ON p.id = r.place_id LEFT JOIN users u ON u.id = r.user_id
     WHERE r.status = ? ORDER BY r.created_at DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`,
  )
    .bind(status)
    .all<Record<string, unknown> & { reasons: string | null; network: string; ip: string; device: string; anon: number }>();
  return c.json({
    items: results.map(({ reasons, network, ip, device, anon, ...r }) => ({
      ...r,
      anonymous: anon === 1,
      reasons: reasons ? reasons.split(',') : [],
      identity: { network, ip, device },
    })),
    page,
  });
});

adminRoutes.post('/admin/reviews/:id/:action{approve|hide}', async (c) => {
  const id = intParam(c.req.param('id'), 'id');
  const status = c.req.param('action') === 'approve' ? 'published' : 'hidden';
  const r = await c.env.DB.prepare(
    `UPDATE ratings SET status = ?, publish_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
  )
    .bind(status, id)
    .run();
  if (!r.meta.changes) throw new ApiError(404, 'rating_not_found', 'Review not found');
  return c.json({ id, status });
});

async function ratingIdentity(db: D1Database, ratingId: number) {
  const r = await db
    .prepare(`SELECT ip_hash AS ipHash, ip_prefix_hash AS ipPrefixHash, device_id AS deviceId, user_id AS userId FROM ratings WHERE id = ?`)
    .bind(ratingId)
    .first<{ ipHash: string | null; ipPrefixHash: string | null; deviceId: string | null; userId: number | null }>();
  if (!r) throw new ApiError(404, 'rating_not_found', 'Review not found');
  return r;
}

adminRoutes.post('/admin/reviews/hide-identity', async (c) => {
  const { ratingId } = await body(c, z.object({ ratingId: z.number().int().positive() }));
  const who = await ratingIdentity(c.env.DB, ratingId);
  const r = await c.env.DB.prepare(
    `UPDATE ratings SET status = 'hidden', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE status != 'hidden' AND ((ip_hash IS NOT NULL AND ip_hash = ?) OR (device_id IS NOT NULL AND device_id = ?) OR (user_id IS NOT NULL AND user_id = ?))`,
  )
    .bind(who.ipHash ?? '\0', who.deviceId ?? '\0', who.userId ?? -1)
    .run();
  return c.json({ hidden: r.meta.changes ?? 0 });
});

// ---------- bans ----------
adminRoutes.get('/admin/bans', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, kind, SUBSTR(value_hash, 1, 8) AS value, reason, until, created_at AS createdAt FROM abuse_bans
     WHERE until IS NULL OR until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ORDER BY id DESC`,
  ).all();
  return c.json(results);
});

adminRoutes.post('/admin/bans', async (c) => {
  const b = await body(
    c,
    z.object({
      ratingId: z.number().int().positive(),
      kind: z.enum(['ip_prefix', 'device', 'user']),
      days: z.number().int().positive().max(3650).nullable().optional(),
      reason: z.string().max(200).optional(),
    }),
  );
  const who = await ratingIdentity(c.env.DB, b.ratingId);
  const value = b.kind === 'ip_prefix' ? who.ipPrefixHash : b.kind === 'device' ? who.deviceId : who.userId != null ? String(who.userId) : null;
  if (!value) throw new ApiError(400, 'validation_error', `This review has no ${b.kind} to ban`);
  const until = b.days ? new Date(Date.now() + b.days * 86400e3).toISOString() : null;
  const row = await c.env.DB.prepare(
    `INSERT INTO abuse_bans (kind, value_hash, reason, until, created_by) VALUES (?, ?, ?, ?, ?)
     RETURNING id, kind, value_hash AS valueHash, reason, until`,
  )
    .bind(b.kind, value, b.reason ?? null, until, c.get('user')!.id)
    .first();
  return c.json(row, 201);
});

adminRoutes.delete('/admin/bans/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM abuse_bans WHERE id = ?`).bind(intParam(c.req.param('id'), 'id')).run();
  return c.body(null, 204);
});

// ---------- sync & budget ----------
adminRoutes.post('/admin/sync', async (c) => {
  const { kind } = await body(c, z.object({ kind: z.enum(SYNC_KINDS as [string, ...string[]]) }));
  const runId = await startSyncRun(c.env.DB, kind as (typeof SYNC_KINDS)[number]);
  c.executionCtx.waitUntil(runSync(c.env.DB, c.env, kind as (typeof SYNC_KINDS)[number], runId));
  return c.json({ runId }, 202);
});

/**
 * One chunk of a full city scan, run while the request is open (the admin page calls it in a loop until
 * `done` adds up to `total`). Chunks stay under the Workers Free limit of 50 outgoing fetches per request.
 */
adminRoutes.post('/admin/scan', async (c) => {
  const { city: slug } = await body(c, z.object({ city: z.string().min(1).max(64) }));
  const city = await getCityBySlug(c.env.DB, slug);
  if (!city) throw new ApiError(404, 'city_not_found', 'City not found');
  const runId = await startSyncRun(c.env.DB, 'scan');
  const stats = newStats();
  const progress = await runDiscovery(c.env.DB, c.env, city, stats, fetch, SYNC.scanCallsPerRequest);
  const run = await finishSyncRun(c.env.DB, runId, 'scan', stats);
  return c.json({ runId, ...progress, placesAdded: stats.placesAdded, callsUsed: stats.callsUsed, error: run.error, notes: [...new Set(stats.notes)] });
});

/**
 * One chunk of Google ratings + reviews for places that have never been rated (then the oldest ones);
 * the admin page repeats it until `remaining` reaches 0. Same 40-call chunk size as the scan.
 */
adminRoutes.post('/admin/ratings', async (c) => {
  const runId = await startSyncRun(c.env.DB, 'ratings');
  const stats = newStats();
  await runRefresh(c.env.DB, c.env, stats, fetch, SYNC.scanCallsPerRequest);
  const run = await finishSyncRun(c.env.DB, runId, 'ratings', stats);
  const left = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM places WHERE google_place_id IS NOT NULL AND status != 'hidden' AND google_last_synced_at IS NULL`,
  ).first<{ n: number }>();
  return c.json({
    runId,
    done: stats.callsUsed,
    remaining: left?.n ?? 0,
    externalAdded: stats.externalAdded,
    error: run.error,
    notes: [...new Set(stats.notes)],
  });
});

adminRoutes.get('/admin/sync-runs', async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50));
  const { results } = await c.env.DB.prepare(`${SYNC_RUN_SELECT} ORDER BY id DESC LIMIT ?`).bind(limit).all();
  return c.json(results);
});

adminRoutes.get('/admin/budget', async (c) => {
  const month = new Date().toISOString().slice(0, 7);
  const used = await getBudgetUsage(c.env.DB, month);
  return c.json({ month, usage: Object.entries(CAPS).map(([sku, cap]) => ({ sku, used: used[sku] ?? 0, cap })) });
});
