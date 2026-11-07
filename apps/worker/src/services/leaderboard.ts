import { rankScore, round1, type LeaderboardKind, type LeaderboardRow } from '@kebabarium/shared';
import { loadCityPlaces, type ScoredPlace } from './places';

const LIMIT = 10;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const alive = (p: ScoredPlace) => p.row.status !== 'dead' && p.row.status !== 'hidden';

function groupAverage(places: ScoredPlace[], key: (p: ScoredPlace) => { id: number | string; name: string } | null, digits: 1 | 2) {
  const groups = new Map<string | number, { name: string; scores: number[]; count: number }>();
  for (const p of places.filter(alive)) {
    const k = key(p);
    if (!k) continue;
    const g = groups.get(k.id) ?? { name: k.name, scores: [], count: 0 };
    g.count += 1;
    if (p.combined != null) g.scores.push(p.combined);
    groups.set(k.id, g);
  }
  const f = digits === 1 ? round1 : (n: number) => Math.round(n * 100) / 100;
  return [...groups.entries()]
    .filter(([, g]) => g.scores.length > 0)
    .map(([id, g]) => ({ id, name: g.name, value: f(mean(g.scores)), extra: String(g.count) }));
}

/** Latest published review per place (ours or external), for the freshness part of the ranking. */
async function lastReviewAt(db: D1Database, cityId: number): Promise<Map<number, string>> {
  const { results } = await db
    .prepare(
      `SELECT place_id AS id, MAX(at) AS last FROM (
         SELECT r.place_id, r.created_at AS at FROM ratings r JOIN places p ON p.id = r.place_id WHERE p.city_id = ?1 AND r.status = 'published'
         UNION ALL
         SELECT place_id, published_at FROM external_reviews WHERE city_id = ?1 AND place_id IS NOT NULL
       ) GROUP BY place_id`,
    )
    .bind(cityId)
    .all<{ id: number; last: string }>();
  return new Map(results.map((r) => [r.id, r.last]));
}

export async function loadLeaderboard(db: D1Database, cityId: number, kind: LeaderboardKind): Promise<LeaderboardRow[]> {
  let rows: Omit<LeaderboardRow, 'rank' | 'kind'>[];
  if (kind === 'tasters') {
    const { results } = await db
      .prepare(
        `SELECT u.id AS id,
                CASE WHEN u.show_real_name = 1 AND u.first_name IS NOT NULL THEN TRIM(u.first_name || ' ' || COALESCE(u.last_name, ''))
                     ELSE COALESCE(u.nickname, '') END AS name,
                COUNT(r.id) AS value
         FROM ratings r JOIN users u ON u.id = r.user_id JOIN places p ON p.id = r.place_id
         WHERE p.city_id = ? AND r.status = 'published' AND u.hide_from_leaderboard = 0 AND u.nickname IS NOT NULL
         GROUP BY u.id ORDER BY value DESC, name ASC LIMIT ?`,
      )
      .bind(cityId, LIMIT)
      .all<{ id: number; name: string; value: number }>();
    rows = results;
  } else {
    const places = await loadCityPlaces(db, cityId);
    if (kind === 'spots') {
      const scored = places.filter((p) => alive(p) && p.combined != null);
      const prior = scored.length ? mean(scored.map((p) => p.combined!)) : 4;
      const last = await lastReviewAt(db, cityId);
      const now = new Date();
      rows = scored
        .map((p) => ({
          id: p.row.id,
          name: p.row.name,
          value: p.summary.score!,
          rank: rankScore(p.combined!, p.summary.reviewCount, last.get(p.row.id) ?? null, prior, now),
        }))
        .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
        .map(({ rank: _rank, ...r }) => r);
    } else if (kind === 'chains') {
      rows = groupAverage(places, (p) => (p.row.chainId ? { id: p.row.chainId, name: p.row.chainName ?? '' } : null), 1);
    } else {
      rows = groupAverage(places, (p) => (p.row.district ? { id: p.row.district, name: p.row.district } : null), 2);
    }
    if (kind !== 'spots') rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }
  return rows.slice(0, LIMIT).map((r, i) => ({ ...r, rank: i + 1, kind }));
}
