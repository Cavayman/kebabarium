import { round1, type LeaderboardKind, type LeaderboardRow } from '@kebabarium/shared';
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
      rows = places
        .filter((p) => alive(p) && p.summary.score != null)
        .map((p) => ({ id: p.row.id, name: p.row.name, value: p.summary.score!, raw: p.combined! }))
        .sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name))
        .map(({ raw: _raw, ...r }) => r);
    } else if (kind === 'chains') {
      rows = groupAverage(places, (p) => (p.row.chainId ? { id: p.row.chainId, name: p.row.chainName ?? '' } : null), 1);
    } else {
      rows = groupAverage(places, (p) => (p.row.district ? { id: p.row.district, name: p.row.district } : null), 2);
    }
    if (kind !== 'spots') rows.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  }
  return rows.slice(0, LIMIT).map((r, i) => ({ ...r, rank: i + 1, kind }));
}
