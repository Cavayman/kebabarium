import type { CityStats } from '@kebabarium/shared';
import type { CityRow } from '../db/cities';

export async function loadStats(db: D1Database, city: CityRow): Promise<CityStats> {
  const [places, ours, ext, sync] = await db.batch([
    db
      .prepare(`SELECT COUNT(*) AS spots, SUM(status = 'dead') AS dead FROM places WHERE city_id = ? AND status != 'hidden'`)
      .bind(city.id),
    db
      .prepare(`SELECT COUNT(*) AS n FROM ratings r JOIN places p ON p.id = r.place_id WHERE p.city_id = ? AND r.status = 'published'`)
      .bind(city.id),
    db.prepare(`SELECT COUNT(*) AS n FROM external_reviews WHERE city_id = ?`).bind(city.id),
    db.prepare(`SELECT MAX(finished_at) AS at FROM sync_runs`),
  ]);
  const p = (places!.results[0] ?? {}) as { spots: number; dead: number | null };
  const spots = p.spots ?? 0;
  const dead = p.dead ?? 0;
  return {
    city: city.name,
    spots,
    reviews: ((ours!.results[0] as { n: number }).n ?? 0) + ((ext!.results[0] as { n: number }).n ?? 0),
    open: spots - dead,
    dead,
    lastSyncAt: (sync!.results[0] as { at: string | null }).at ?? null,
  };
}
