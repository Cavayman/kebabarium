import type { CityRow } from '../db/cities';
import type { Env } from '../env';
import { takeBudget } from './budget';
import { normalizeName } from './chains';
import { SYNC } from './config';
import type { SyncStats } from './stats';

const GRAPH = 'https://graph.threads.net';
const SKU = 'threads.search';
const TOKEN_KEY = 'threads:token';
const DAY = 86400e3;
const MIN_MATCH_LEN = 5;

interface StoredToken {
  token: string;
  expiresAt: string | null;
}

class ThreadsError extends Error {
  constructor(public status: number) {
    super(`threads ${status}`);
  }
}

async function storedToken(db: D1Database): Promise<StoredToken | null> {
  const r = await db.prepare(`SELECT value FROM sync_cursor WHERE key = ?`).bind(TOKEN_KEY).first<{ value: string }>();
  return r ? (JSON.parse(r.value) as StoredToken) : null;
}

/** The refreshed token stored in D1 wins over the bootstrap secret. */
async function currentToken(db: D1Database, env: Env): Promise<string | null> {
  return (await storedToken(db))?.token ?? env.THREADS_TOKEN ?? null;
}

/** Long-lived Threads tokens last 60 days; refresh when < 7 days remain (or expiry unknown). */
export async function refreshThreadsToken(db: D1Database, env: Env, fetcher: typeof fetch = fetch): Promise<void> {
  const stored = await storedToken(db);
  const token = stored?.token ?? env.THREADS_TOKEN;
  if (!token) return;
  if (stored?.expiresAt && Date.parse(stored.expiresAt) - Date.now() > 7 * DAY) return;
  try {
    const url = new URL(`${GRAPH}/refresh_access_token`);
    url.searchParams.set('grant_type', 'th_refresh_token');
    url.searchParams.set('access_token', token);
    const res = await fetcher(url.toString());
    if (!res.ok) return;
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return;
    const value: StoredToken = { token: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in ?? 60 * 86400) * 1000).toISOString() };
    await db
      .prepare(`INSERT INTO sync_cursor (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
      .bind(TOKEN_KEY, JSON.stringify(value))
      .run();
  } catch {
    // keep the old token; the next hourly run retries
  }
}

interface ThreadsPost {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string;
}

/** Longest place/chain name (≥5 chars) contained in the post text, else null. */
function linker(names: Array<{ id: number; norm: string }>) {
  const usable = names.filter((n) => n.norm.length >= MIN_MATCH_LEN).sort((a, b) => b.norm.length - a.norm.length);
  return (text: string): number | null => {
    const t = ` ${normalizeName(text)} `;
    return usable.find((n) => t.includes(` ${n.norm} `) || t.includes(` ${n.norm}`))?.id ?? null;
  };
}

export async function runThreads(db: D1Database, env: Env, city: CityRow, stats: SyncStats, fetcher: typeof fetch = fetch): Promise<void> {
  const token = await currentToken(db, env);
  if (!token) {
    stats.notes.push('threads_not_configured');
    stats.threadsStatus = 'unavailable';
    return;
  }
  const { results: places } = await db
    .prepare(
      `SELECT p.id, p.norm_name AS norm FROM places p WHERE p.city_id = ? AND p.status = 'open'
       UNION ALL
       SELECT (SELECT MIN(p.id) FROM places p WHERE p.chain_id = c.id AND p.status = 'open') AS id, c.norm_name AS norm
       FROM chains c WHERE c.city_id = ?`,
    )
    .bind(city.id, city.id)
    .all<{ id: number | null; norm: string }>();
  const link = linker(places.filter((p): p is { id: number; norm: string } => p.id != null));

  const key = `threads:${city.slug}`;
  const cur = await db.prepare(`SELECT value FROM sync_cursor WHERE key = ?`).bind(key).first<{ value: string }>();
  let cursor = Number(cur?.value ?? 0) % SYNC.queries.length;
  stats.threadsStatus = 'ok';

  for (let k = 0; k < SYNC.threadsPerRun; k++) {
    if (!(await takeBudget(db, SKU))) {
      stats.notes.push(`budget_exhausted:${SKU}`);
      break;
    }
    const url = new URL(`${GRAPH}/v1.0/keyword_search`);
    url.searchParams.set('q', `${SYNC.queries[cursor]} ${city.name}`);
    url.searchParams.set('search_type', 'RECENT');
    url.searchParams.set('fields', 'id,text,username,permalink,timestamp');
    url.searchParams.set('access_token', token);
    try {
      const res = await fetcher(url.toString());
      if (!res.ok) throw new ThreadsError(res.status);
      const { data = [] } = (await res.json()) as { data?: ThreadsPost[] };
      for (const p of data) {
        if (!p.id || !p.text) continue;
        const r = await db
          .prepare(
            `INSERT OR IGNORE INTO external_reviews (city_id, place_id, source, external_id, author, text, url, published_at)
             VALUES (?, ?, 'threads', ?, ?, ?, ?, ?)`,
          )
          .bind(
            city.id,
            link(p.text),
            p.id,
            p.username ? `@${p.username}` : null,
            p.text.slice(0, 1000),
            p.permalink ?? null,
            p.timestamp ? new Date(p.timestamp.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')).toISOString() : new Date().toISOString(),
          )
          .run();
        stats.externalAdded += r.meta.changes ?? 0;
      }
    } catch (e) {
      stats.threadsStatus = 'unavailable';
      stats.errors.push(e instanceof ThreadsError ? e.message : `threads: ${String(e)}`);
      break;
    }
    cursor = (cursor + 1) % SYNC.queries.length;
  }
  await db
    .prepare(`INSERT INTO sync_cursor (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    .bind(key, String(cursor))
    .run();
}
