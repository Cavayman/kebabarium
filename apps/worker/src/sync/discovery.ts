import type { CityRow } from '../db/cities';
import type { Env } from '../env';
import { takeBudget } from './budget';
import { assignChain, normalizeName } from './chains';
import { SYNC } from './config';
import { districtOf } from './districts';
import { GoogleError, googlePlaces, SKU_BASICS, SKU_SEARCH, type FoundPlace, type Rect } from './google';
import type { SyncStats } from './stats';

const KM_PER_DEG_LAT = 111.32;

/** Grid of ~tileKm squares covering the city bbox, nearest to the city centre first (the centre fills in within hours). */
export function tilesFor(city: CityRow): Rect[] {
  const cos = Math.cos((city.centerLat * Math.PI) / 180);
  const dist = (r: Rect) =>
    Math.hypot((r.low.latitude + r.high.latitude) / 2 - city.centerLat, ((r.low.longitude + r.high.longitude) / 2 - city.centerLng) * cos);
  return gridFor(city)
    .map((r) => ({ r, d: dist(r) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.r);
}

function gridFor(city: CityRow): Rect[] {
  const [minLng, minLat, maxLng, maxLat] = city.bbox;
  const dLat = SYNC.tileKm / KM_PER_DEG_LAT;
  const dLng = SYNC.tileKm / (KM_PER_DEG_LAT * Math.cos((city.centerLat * Math.PI) / 180));
  const out: Rect[] = [];
  for (let lat = minLat; lat < maxLat; lat += dLat) {
    for (let lng = minLng; lng < maxLng; lng += dLng) {
      out.push({
        low: { latitude: lat, longitude: lng },
        high: { latitude: Math.min(lat + dLat, maxLat), longitude: Math.min(lng + dLng, maxLng) },
      });
    }
  }
  return out;
}


const inBbox = (city: CityRow, lat: number, lng: number) =>
  lng >= city.bbox[0] && lat >= city.bbox[1] && lng <= city.bbox[2] && lat <= city.bbox[3];

/** Thrown to end a run quietly (a monthly budget is used up). */
class Stop extends Error {}

async function ignore(db: D1Database, googleId: string, reason: string): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO google_ignored (google_place_id, reason) VALUES (?, ?)`).bind(googleId, reason).run();
}

/** Stores a newly found place from its details, or remembers why it was rejected. */
async function addFound(db: D1Database, city: CityRow, p: FoundPlace, stats: SyncStats): Promise<void> {
  const name = p.displayName?.text?.trim();
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!name || lat == null || lng == null) return ignore(db, p.id, 'incomplete');
  if (!inBbox(city, lat, lng)) return ignore(db, p.id, 'outside_city');
  if (p.businessStatus === 'CLOSED_PERMANENTLY') return ignore(db, p.id, 'closed'); // never import places that are already closed for good
  const status = p.businessStatus === 'CLOSED_TEMPORARILY' ? 'closed_temp' : 'open';
  const row = await db
    .prepare(
      `INSERT INTO places (city_id, google_place_id, name, norm_name, address, lat, lng, district, status, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (google_place_id) DO NOTHING RETURNING id`,
    )
    .bind(city.id, p.id, name, normalizeName(name), p.formattedAddress ?? null, lat, lng, districtOf(city.slug, lat, lng), status, new Date().toISOString())
    .first<{ id: number }>();
  if (!row) return;
  stats.placesAdded++;
  await assignChain(db, row.id);
}

export interface DiscoveryProgress {
  /** (tile, query) pairs fully processed in this run. */
  done: number;
  /** Pairs in one full pass over the city. */
  total: number;
  /** Where the next run starts. */
  cursor: number;
}

/**
 * Walks the next (tile, query) pairs of a city from a saved cursor, using at most `maxCalls` Google calls.
 * Searches return ids only (free); details (Pro) are fetched once, for ids we have never seen.
 * A pair counts as done only once every page and every new place in it is stored, so a run that runs out
 * of calls mid-pair repeats that pair next time (repeating the free search costs nothing).
 */
export async function runDiscovery(
  db: D1Database,
  env: Env,
  city: CityRow,
  stats: SyncStats,
  fetcher: typeof fetch = fetch,
  maxCalls: number = SYNC.discoveryCallsPerRun,
): Promise<DiscoveryProgress> {
  const tiles = tilesFor(city);
  const total = tiles.length * SYNC.queries.length;
  const key = `discovery:centre:${city.slug}`; // "centre": centre-first tile order (old row-major cursors are ignored)
  const cur = await db.prepare(`SELECT value FROM sync_cursor WHERE key = ?`).bind(key).first<{ value: string }>();
  let cursor = Number(cur?.value ?? 0) % total;
  if (!env.GOOGLE_PLACES_KEY) {
    stats.notes.push('google_not_configured');
    return { done: 0, total, cursor };
  }
  const google = googlePlaces(env.GOOGLE_PLACES_KEY, fetcher);
  let calls = 0;
  const spend = async (sku: string) => {
    if (!(await takeBudget(db, sku))) {
      stats.notes.push(`budget_exhausted:${sku}`);
      throw new Stop();
    }
    calls++;
    stats.callsUsed++;
  };

  /** Stores one page of ids; false when the call allowance ran out before every new place was fetched. */
  const handleIds = async (ids: string[]): Promise<boolean> => {
    const unique = [...new Set(ids)];
    if (!unique.length) return true;
    const ph = unique.map(() => '?').join(',');
    const { results } = await db
      .prepare(
        `SELECT google_place_id AS g, 1 AS kept FROM places WHERE google_place_id IN (${ph})
         UNION ALL SELECT google_place_id AS g, 0 AS kept FROM google_ignored WHERE google_place_id IN (${ph})`,
      )
      .bind(...unique, ...unique)
      .all<{ g: string; kept: number }>();
    const kept = results.filter((r) => r.kept).map((r) => r.g);
    if (kept.length) {
      await db
        .prepare(`UPDATE places SET last_seen_at = ? WHERE google_place_id IN (${kept.map(() => '?').join(',')})`)
        .bind(new Date().toISOString(), ...kept)
        .run();
      stats.placesUpdated += kept.length;
    }
    const seen = new Set(results.map((r) => r.g));
    for (const id of unique.filter((i) => !seen.has(i))) {
      if (calls >= maxCalls) return false;
      await spend(SKU_BASICS);
      await addFound(db, city, { ...(await google.basics(id)), id }, stats);
    }
    return true;
  };

  const scanPair = async (tile: Rect, query: string): Promise<boolean> => {
    let token: string | undefined;
    for (let page = 0; page < SYNC.maxPagesPerSearch; page++) {
      if (calls >= maxCalls) return false;
      await spend(SKU_SEARCH);
      const res = await google.searchIds(query, tile, token);
      if (!(await handleIds(res.ids))) return false;
      token = res.nextPageToken;
      if (!token) break;
    }
    return true;
  };

  let done = 0;
  try {
    while (done < total) {
      const tile = tiles[Math.floor(cursor / SYNC.queries.length)]!;
      const query = SYNC.queries[cursor % SYNC.queries.length]!;
      if (!(await scanPair(tile, query))) break;
      done++;
      cursor = (cursor + 1) % total;
    }
  } catch (e) {
    if (!(e instanceof Stop)) stats.errors.push(e instanceof GoogleError ? e.message : `discovery: ${String(e)}`);
  }
  await db
    .prepare(`INSERT INTO sync_cursor (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(cursor))
    .run();
  return { done, total, cursor };
}
