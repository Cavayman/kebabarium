import type { CityRow } from '../db/cities';
import type { Env } from '../env';
import { takeBudget } from './budget';
import { assignChain, normalizeName } from './chains';
import { SYNC } from './config';
import { districtOf } from './districts';
import { GoogleError, googlePlaces, SKU_SEARCH, type FoundPlace, type Rect } from './google';
import type { SyncStats } from './stats';

const KM_PER_DEG_LAT = 111.32;

/** Row-major grid of ~tileKm squares covering the city bbox. */
export function tilesFor(city: CityRow): Rect[] {
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

async function upsertFound(db: D1Database, city: CityRow, p: FoundPlace, stats: SyncStats): Promise<void> {
  const name = p.displayName?.text?.trim();
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  if (!name || lat == null || lng == null || !inBbox(city, lat, lng)) return;
  const now = new Date().toISOString();
  const existing = await db
    .prepare(`SELECT id, status FROM places WHERE google_place_id = ?`)
    .bind(p.id)
    .first<{ id: number; status: string }>();
  if (existing) {
    const dies = p.businessStatus === 'CLOSED_PERMANENTLY' && existing.status !== 'dead' && existing.status !== 'hidden';
    await db
      .prepare(
        `UPDATE places SET last_seen_at = ?, address = COALESCE(address, ?),
           status = CASE WHEN ? THEN 'dead' ELSE status END, dead_reason = CASE WHEN ? THEN 'google_closed' ELSE dead_reason END
         WHERE id = ?`,
      )
      .bind(now, p.formattedAddress ?? null, dies ? 1 : 0, dies ? 1 : 0, existing.id)
      .run();
    if (dies) stats.markedDead++;
    stats.placesUpdated++;
    return;
  }
  const status = p.businessStatus === 'CLOSED_PERMANENTLY' ? 'dead' : p.businessStatus === 'CLOSED_TEMPORARILY' ? 'closed_temp' : 'open';
  if (status === 'dead') return; // never import places that are already closed for good
  const row = await db
    .prepare(
      `INSERT INTO places (city_id, google_place_id, name, norm_name, address, lat, lng, district, status, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(city.id, p.id, name, normalizeName(name), p.formattedAddress ?? null, lat, lng, districtOf(city.slug, lat, lng), status, now)
    .first<{ id: number }>();
  stats.placesAdded++;
  await assignChain(db, row!.id);
}

/** Processes the next `tilesPerRun` (tile, query) pairs for a city, resuming from a cursor. */
export async function runDiscovery(db: D1Database, env: Env, city: CityRow, stats: SyncStats, fetcher: typeof fetch = fetch): Promise<void> {
  if (!env.GOOGLE_PLACES_KEY) {
    stats.notes.push('google_not_configured');
    return;
  }
  const google = googlePlaces(env.GOOGLE_PLACES_KEY, fetcher);
  const tiles = tilesFor(city);
  const total = tiles.length * SYNC.queries.length;
  const key = `discovery:${city.slug}`;
  const cur = await db.prepare(`SELECT value FROM sync_cursor WHERE key = ?`).bind(key).first<{ value: string }>();
  let cursor = Number(cur?.value ?? 0) % total;

  for (let k = 0; k < SYNC.tilesPerRun; k++) {
    if (!(await takeBudget(db, SKU_SEARCH))) {
      stats.notes.push(`budget_exhausted:${SKU_SEARCH}`);
      break;
    }
    stats.callsUsed++;
    const tile = tiles[Math.floor(cursor / SYNC.queries.length)]!;
    const query = SYNC.queries[cursor % SYNC.queries.length]!;
    try {
      const { places } = await google.textSearch(query, tile);
      for (const p of places) await upsertFound(db, city, p, stats);
    } catch (e) {
      stats.errors.push(e instanceof GoogleError ? e.message : `discovery: ${String(e)}`);
      break;
    }
    cursor = (cursor + 1) % total;
  }
  await db
    .prepare(`INSERT INTO sync_cursor (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(cursor))
    .run();
}
