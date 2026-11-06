import type { City, LeaderboardKind, ReviewSource, RuntimeConfig } from '@kebabarium/shared';
import { Hono, type Context } from 'hono';
import { getCityBySlug, listCities, type CityRow } from '../db/cities';
import { ApiError } from '../errors';
import type { AppEnv } from '../env';
import { loadFeed } from '../services/feed';
import { findNear, RADII, type Radius } from '../services/geo';
import { loadLeaderboard } from '../services/leaderboard';
import { loadCityPlaces, loadPlaceDetail } from '../services/places';
import { loadStats } from '../services/stats';
import { viewerOf } from '../viewer';

export const publicRoutes = new Hono<AppEnv>();

const CACHE_30 = 'public, max-age=30';
const KINDS: LeaderboardKind[] = ['spots', 'chains', 'districts', 'tasters'];
const SOURCES: Array<'all' | ReviewSource> = ['all', 'ours', 'google', 'threads'];

async function city(c: Context<AppEnv>): Promise<CityRow> {
  const row = await getCityBySlug(c.env.DB, c.req.param('slug')!);
  if (!row || !row.active) throw new ApiError(404, 'city_not_found', 'City not found');
  return row;
}

function num(v: string | undefined, name: string): number {
  const n = Number(v);
  if (v == null || v === '' || !Number.isFinite(n)) throw new ApiError(400, 'validation_error', `Invalid ${name}`);
  return n;
}

publicRoutes.get('/config', (c) => {
  const e = c.env;
  const body: RuntimeConfig = {
    mapsBrowserKey: e.GOOGLE_MAPS_BROWSER_KEY ?? null,
    mapId: e.GOOGLE_MAP_ID ?? null,
    turnstileSiteKey: e.TURNSTILE_SITE_KEY ?? null,
    googleClientId: e.GOOGLE_OAUTH_CLIENT_ID ?? null,
    mapProvider: e.GOOGLE_MAPS_BROWSER_KEY || e.ENVIRONMENT === 'production' ? 'google' : 'maplibre',
  };
  return c.json(body, 200, { 'Cache-Control': 'public, max-age=300' });
});

publicRoutes.get('/cities', async (c) => {
  const cities = await listCities(c.env.DB);
  const counts = await c.env.DB.prepare(
    `SELECT city_id AS id, COUNT(*) AS n FROM places WHERE status != 'hidden' GROUP BY city_id`,
  ).all<{ id: number; n: number }>();
  const byId = new Map(counts.results.map((r) => [r.id, r.n]));
  const body: City[] = cities.map((x) => ({
    id: x.id,
    slug: x.slug,
    name: x.name,
    nameEn: x.nameEn,
    center: { lat: x.centerLat, lng: x.centerLng },
    zoom: x.zoom,
    bbox: x.bbox,
    spots: byId.get(x.id) ?? 0,
  }));
  return c.json(body, 200, { 'Cache-Control': CACHE_30 });
});

publicRoutes.get('/cities/:slug/places', async (c) => {
  const places = await loadCityPlaces(c.env.DB, (await city(c)).id);
  return c.json(places.map((p) => p.summary), 200, { 'Cache-Control': CACHE_30 });
});

publicRoutes.get('/cities/:slug/stats', async (c) => {
  return c.json(await loadStats(c.env.DB, await city(c)), 200, { 'Cache-Control': CACHE_30 });
});

publicRoutes.get('/cities/:slug/leaderboard', async (c) => {
  const kind = (c.req.query('kind') ?? 'spots') as LeaderboardKind;
  if (!KINDS.includes(kind)) throw new ApiError(400, 'validation_error', 'Invalid kind');
  return c.json(await loadLeaderboard(c.env.DB, (await city(c)).id, kind), 200, { 'Cache-Control': CACHE_30 });
});

publicRoutes.get('/cities/:slug/feed', async (c) => {
  const source = (c.req.query('source') ?? 'all') as 'all' | ReviewSource;
  if (!SOURCES.includes(source)) throw new ApiError(400, 'validation_error', 'Invalid source');
  const since = c.req.query('since');
  if (since && Number.isNaN(Date.parse(since))) throw new ApiError(400, 'validation_error', 'Invalid since');
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit') ?? 30) || 30));
  const feed = await loadFeed(c.env.DB, (await city(c)).id, { since, source, limit }, await viewerOf(c));
  return c.json(feed, 200, { 'Cache-Control': 'no-store' });
});

publicRoutes.get('/places/near', async (c) => {
  const lat = num(c.req.query('lat'), 'lat');
  const lng = num(c.req.query('lng'), 'lng');
  const rq = c.req.query('r');
  let r: Radius | undefined;
  if (rq != null) {
    r = Number(rq) as Radius;
    if (!RADII.includes(r)) throw new ApiError(400, 'validation_error', 'Invalid r');
  }
  return c.json(await findNear(c.env.DB, { lat, lng }, r), 200, { 'Cache-Control': 'no-store' });
});

publicRoutes.get('/places/:id', async (c) => {
  const id = num(c.req.param('id'), 'id');
  const detail = await loadPlaceDetail(c.env.DB, id, await viewerOf(c));
  if (!detail) throw new ApiError(404, 'place_not_found', 'Place not found');
  return c.json(detail, 200, { 'Cache-Control': 'no-store' });
});
