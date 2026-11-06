import { combinedScore, round1, type PlaceDetail, type PlaceSummary, type ReviewItem } from '@kebabarium/shared';
import { getPlace, listPlaces, type PlaceRow } from '../db/places';

export interface Viewer {
  deviceId?: string | null;
  userId?: number | null;
}

interface Agg {
  s: number;
  w: number;
  n: number;
}

/** Weighted rating sums per place, counting ratings of every place that moved into it (spec §7 moves). */
async function aggregates(db: D1Database, where: string, arg: number): Promise<Map<number, Agg>> {
  const { results } = await db
    .prepare(
      `WITH RECURSIVE chain(src, dst, depth) AS (
         SELECT id, id, 0 FROM places WHERE ${where} = ?1
         UNION ALL
         SELECT p.id, chain.dst, chain.depth + 1 FROM places p JOIN chain ON p.moved_to_place_id = chain.src WHERE chain.depth < 5
       )
       SELECT chain.dst AS placeId, SUM(r.stars * r.weight) AS s, SUM(r.weight) AS w, COUNT(r.id) AS n
       FROM chain JOIN ratings r ON r.place_id = chain.src AND r.status = 'published'
       GROUP BY chain.dst`,
    )
    .bind(arg)
    .all<Agg & { placeId: number }>();
  return new Map(results.map((r) => [r.placeId, r]));
}

/** Unrounded combined score (used for averages over chains/districts). */
export function rawCombined(row: PlaceRow, agg: Agg | undefined): number | null {
  const our = agg && agg.w > 0 ? agg.s / agg.w : null;
  return combinedScore(our, row.googleRating);
}

export function toSummary(row: PlaceRow, agg: Agg | undefined): PlaceSummary {
  const our = agg && agg.w > 0 ? agg.s / agg.w : null;
  const combined = combinedScore(our, row.googleRating);
  const ourCount = agg?.n ?? 0;
  return {
    id: row.id,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    district: row.district,
    address: row.address,
    status: row.status,
    deadReason: row.deadReason,
    movedToPlaceId: row.movedToPlaceId,
    chainId: row.chainId,
    chainName: row.chainName,
    logoUrl: row.logoUrl,
    score: combined == null ? null : round1(combined),
    ourScore: our == null ? null : round1(our),
    ourCount,
    googleRating: row.googleRating,
    googleRatingCount: row.googleRatingCount,
    googleAttribution: row.googleRating != null,
    reviewCount: ourCount + (row.googleRatingCount ?? 0),
  };
}

export interface ScoredPlace {
  row: PlaceRow;
  summary: PlaceSummary;
  combined: number | null;
}

export async function loadCityPlaces(db: D1Database, cityId: number): Promise<ScoredPlace[]> {
  const [rows, aggs] = await Promise.all([listPlaces(db, cityId), aggregates(db, 'city_id', cityId)]);
  return rows.map((row) => {
    const agg = aggs.get(row.id);
    return { row, summary: toSummary(row, agg), combined: rawCombined(row, agg) };
  });
}

/** SQL expression for the public name of a rating's author (nickname by default, real name on opt-in). */
export const AUTHOR_SQL = `CASE
  WHEN u.id IS NULL THEN COALESCE(r.nickname, 'анонім')
  WHEN u.show_real_name = 1 AND u.first_name IS NOT NULL THEN TRIM(u.first_name || ' ' || COALESCE(u.last_name, ''))
  ELSE COALESCE(u.nickname, 'анонім') END`;

/** `(r.status = 'published' OR <viewer owns it>)` with bound params appended to `params`. */
export function visibleRatingSql(viewer: Viewer | undefined, params: unknown[]): string {
  const own: string[] = [];
  if (viewer?.deviceId) {
    params.push(viewer.deviceId);
    own.push(`r.device_id = ?${params.length}`);
  }
  if (viewer?.userId) {
    params.push(viewer.userId);
    own.push(`r.user_id = ?${params.length}`);
  }
  return own.length
    ? `(r.status = 'published' OR (r.status IN ('pending', 'held') AND (${own.join(' OR ')})))`
    : `r.status = 'published'`;
}

export async function loadPlaceDetail(db: D1Database, id: number, viewer?: Viewer): Promise<PlaceDetail | null> {
  const row = await getPlace(db, id);
  if (!row || row.status === 'hidden') return null;
  const city = await loadCityPlaces(db, row.cityId);
  const me = city.find((p) => p.row.id === id)!;

  const params: unknown[] = [id];
  const visible = visibleRatingSql(viewer, params);
  const { results: ours } = await db
    .prepare(
      `WITH RECURSIVE chain(src, depth) AS (
         SELECT ?1, 0 UNION ALL
         SELECT p.id, chain.depth + 1 FROM places p JOIN chain ON p.moved_to_place_id = chain.src WHERE chain.depth < 5
       )
       SELECT 'r' || r.id AS id, 'ours' AS source, ${AUTHOR_SQL} AS author, r.stars, r.text, r.place_id AS placeId,
              pl.name AS placeName, r.created_at AS createdAt, r.status
       FROM ratings r JOIN chain ON chain.src = r.place_id JOIN places pl ON pl.id = r.place_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE ${visible}
       ORDER BY r.created_at DESC LIMIT 5`,
    )
    .bind(...params)
    .all<ReviewItem & { status: string }>();
  const { results: google } = await db
    .prepare(
      `SELECT 'e' || e.id AS id, e.source, COALESCE(e.author, 'Google') AS author, e.author_url AS authorUrl, e.stars, e.text,
              e.place_id AS placeId, ?2 AS placeName, e.published_at AS createdAt, e.url
       FROM external_reviews e WHERE e.place_id = ?1 AND e.source = 'google' ORDER BY e.published_at DESC LIMIT 5`,
    )
    .bind(id, row.name)
    .all<ReviewItem>();
  const reviews = [...ours.map(({ status, ...r }) => (status === 'published' ? r : { ...r, ownPending: true })), ...google]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 5);

  const movedFrom = city
    .filter((p) => p.row.movedToPlaceId === id)
    .map((p) => ({ id: p.row.id, name: p.row.name, address: p.row.address }));
  const target = row.movedToPlaceId ? city.find((p) => p.row.id === row.movedToPlaceId) : undefined;
  const chainMembers = row.chainId ? city.filter((p) => p.row.chainId === row.chainId && p.row.status !== 'dead') : [];
  const chainScores = chainMembers.map((p) => p.combined).filter((c): c is number => c != null);

  return {
    ...me.summary,
    reviews,
    movedFrom,
    movedTo: target ? { id: target.row.id, name: target.row.name } : null,
    chainScore: chainScores.length ? round1(chainScores.reduce((a, b) => a + b, 0) / chainScores.length) : null,
    chainSpots: chainMembers.length,
  };
}
