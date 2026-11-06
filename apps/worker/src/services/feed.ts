import { ratingEmoji, type FeedItem, type FeedResponse, type ReviewSource } from '@kebabarium/shared';
import { AUTHOR_SQL, visibleRatingSql, type Viewer } from './places';

export interface FeedQuery {
  since?: string;
  source: 'all' | ReviewSource;
  limit: number;
}

export async function loadFeed(db: D1Database, cityId: number, q: FeedQuery, viewer?: Viewer): Promise<FeedResponse> {
  const params: unknown[] = [cityId];
  const visible = visibleRatingSql(viewer, params);
  params.push(q.since ?? '');
  const sinceIdx = params.length;
  params.push(q.limit);
  const limitIdx = params.length;

  const parts: string[] = [];
  if (q.source === 'all' || q.source === 'ours') {
    parts.push(`SELECT 'r' || r.id AS id, 'ours' AS source, ${AUTHOR_SQL} AS author, NULL AS authorUrl, r.stars, r.text,
        r.place_id AS placeId, p.name AS placeName, r.created_at AS createdAt, NULL AS url, r.status AS status
      FROM ratings r JOIN places p ON p.id = r.place_id LEFT JOIN users u ON u.id = r.user_id
      WHERE p.city_id = ?1 AND ${visible} AND r.created_at > ?${sinceIdx}`);
  }
  if (q.source !== 'ours') {
    const src = q.source === 'all' ? `e.source IN ('google', 'threads')` : `e.source = '${q.source === 'google' ? 'google' : 'threads'}'`;
    parts.push(`SELECT 'e' || e.id AS id, e.source AS source, COALESCE(e.author, '') AS author, e.author_url AS authorUrl, e.stars, e.text,
        e.place_id AS placeId, p.name AS placeName, e.published_at AS createdAt, e.url AS url, 'published' AS status
      FROM external_reviews e LEFT JOIN places p ON p.id = e.place_id
      WHERE e.city_id = ?1 AND ${src} AND e.published_at > ?${sinceIdx}`);
  }
  const { results } = await db
    .prepare(`SELECT * FROM (${parts.join(' UNION ALL ')}) ORDER BY createdAt DESC LIMIT ?${limitIdx}`)
    .bind(...params)
    .all<FeedItem & { status: string }>();

  const items: FeedItem[] = results.map(({ status, ...r }) => ({
    ...r,
    emoji: ratingEmoji(r.stars),
    ...(status === 'published' ? {} : { ownPending: true }),
  }));
  return { items, threadsStatus: await threadsStatus(db, cityId), now: new Date().toISOString() };
}

/** 'ok' when the latest threads sync succeeded, or when we have recent posts and never synced (dev seed). */
async function threadsStatus(db: D1Database, cityId: number): Promise<'ok' | 'unavailable'> {
  const run = await db
    .prepare(`SELECT threads_status AS s FROM sync_runs WHERE threads_status IS NOT NULL ORDER BY id DESC LIMIT 1`)
    .first<{ s: string }>();
  if (run) return run.s === 'ok' ? 'ok' : 'unavailable';
  const any = await db
    .prepare(`SELECT 1 AS x FROM external_reviews WHERE city_id = ? AND source = 'threads' LIMIT 1`)
    .bind(cityId)
    .first();
  return any ? 'ok' : 'unavailable';
}
