import type { Env } from '../env';
import { takeBudget } from './budget';
import { SYNC } from './config';
import { GoogleError, googlePlaces, SKU_DETAILS, type PlaceDetails } from './google';
import type { SyncStats } from './stats';

const DAY = 86400e3;

interface Target {
  id: number;
  cityId: number;
  googlePlaceId: string;
  status: string;
  deadReason: string | null;
}

/** Next status from Google's businessStatus, without overriding admin decisions (moved/admin/hidden). */
function nextStatus(t: Target, d: PlaceDetails): { status: string; deadReason: string | null } {
  if (t.status === 'hidden' || (t.status === 'dead' && t.deadReason !== 'google_closed')) return { status: t.status, deadReason: t.deadReason };
  switch (d.businessStatus) {
    case 'CLOSED_PERMANENTLY':
      return { status: 'dead', deadReason: 'google_closed' };
    case 'CLOSED_TEMPORARILY':
      return { status: 'closed_temp', deadReason: null };
    case 'OPERATIONAL':
      return { status: 'open', deadReason: null };
    default:
      return { status: t.status, deadReason: t.deadReason };
  }
}

/** Refreshes rating/status/reviews for the oldest-synced places, then flags dead candidates (spec §8 steps 2–3). */
export async function runRefresh(db: D1Database, env: Env, stats: SyncStats, fetcher: typeof fetch = fetch): Promise<void> {
  if (!env.GOOGLE_PLACES_KEY) {
    stats.notes.push('google_not_configured');
  } else {
    const google = googlePlaces(env.GOOGLE_PLACES_KEY, fetcher);
    const { results } = await db
      .prepare(
        `SELECT id, city_id AS cityId, google_place_id AS googlePlaceId, status, dead_reason AS deadReason FROM places
         WHERE google_place_id IS NOT NULL AND status != 'hidden'
         ORDER BY google_last_synced_at IS NOT NULL, google_last_synced_at, id LIMIT ?`,
      )
      .bind(SYNC.refreshPerRun)
      .all<Target>();
    for (const t of results) {
      if (!(await takeBudget(db, SKU_DETAILS))) {
        stats.notes.push(`budget_exhausted:${SKU_DETAILS}`);
        break;
      }
      stats.callsUsed++;
      let d: PlaceDetails;
      try {
        d = await google.details(t.googlePlaceId);
      } catch (e) {
        stats.errors.push(e instanceof GoogleError ? e.message : `refresh: ${String(e)}`);
        break;
      }
      const next = nextStatus(t, d);
      if (next.status === 'dead' && t.status !== 'dead') stats.markedDead++;
      const now = new Date().toISOString();
      await db
        .prepare(
          `UPDATE places SET google_rating = ?, google_rating_count = ?, status = ?, dead_reason = ?, google_last_synced_at = ?,
             updated_at = ? WHERE id = ?`,
        )
        .bind(d.rating ?? null, d.userRatingCount ?? null, next.status, next.deadReason, now, now, t.id)
        .run();
      stats.placesUpdated++;
      for (const r of (d.reviews ?? []).slice(0, 5)) {
        const res = await db
          .prepare(
            `INSERT OR IGNORE INTO external_reviews (city_id, place_id, source, external_id, author, author_url, text, stars, url, published_at)
             VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            t.cityId,
            t.id,
            r.name,
            r.authorAttribution?.displayName ?? 'Google',
            r.authorAttribution?.uri ?? null,
            r.text?.text ?? r.originalText?.text ?? null,
            r.rating ?? null,
            r.googleMapsUri ?? null,
            r.publishTime ?? now,
          )
          .run();
        stats.externalAdded += res.meta.changes ?? 0;
      }
    }
  }
  await flagDeadCandidates(db);
}

/** Not seen by discovery for 30 days and no rating activity for 180 days → admin review queue (never auto-hidden). */
export async function flagDeadCandidates(db: D1Database, now = new Date()): Promise<void> {
  const seen = new Date(now.getTime() - SYNC.deadNotSeenDays * DAY).toISOString();
  const active = new Date(now.getTime() - SYNC.deadNoActivityDays * DAY).toISOString();
  await db
    .prepare(
      `UPDATE places SET dead_candidate = 1
       WHERE status = 'open' AND dead_candidate = 0 AND last_seen_at IS NOT NULL AND last_seen_at < ?1
         AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.place_id = places.id AND (r.created_at > ?2 OR r.updated_at > ?2))
         AND NOT EXISTS (SELECT 1 FROM external_reviews e WHERE e.place_id = places.id AND e.published_at > ?2)`,
    )
    .bind(seen, active)
    .run();
}
