import { listCities } from '../db/cities';
import type { Env } from '../env';
import type { SyncKind } from './config';
import { runDiscovery } from './discovery';
import { runRefresh } from './refresh';
import { newStats, type SyncStats } from './stats';
import { refreshThreadsToken, runThreads } from './threads';

export interface SyncRunRow {
  id: number;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  callsUsed: number;
  placesAdded: number;
  placesUpdated: number;
  markedDead: number;
  externalAdded: number;
  threadsStatus: string | null;
  error: string | null;
  notes: string | null;
}

export const SYNC_RUN_SELECT = `SELECT id, kind, started_at AS startedAt, finished_at AS finishedAt, calls_used AS callsUsed,
  places_added AS placesAdded, places_updated AS placesUpdated, marked_dead AS markedDead, external_added AS externalAdded,
  threads_status AS threadsStatus, error, notes FROM sync_runs`;

export async function startSyncRun(db: D1Database, kind: SyncKind): Promise<number> {
  const r = await db.prepare(`INSERT INTO sync_runs (kind) VALUES (?) RETURNING id`).bind(kind).first<{ id: number }>();
  return r!.id;
}

async function step(stats: SyncStats, name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    stats.errors.push(`${name}: ${String(e)}`);
  }
}

/** One sync pass (spec §8). Every step is isolated: one failing source never stops the others. */
export async function runSync(db: D1Database, env: Env, kind: SyncKind, runId?: number, fetcher: typeof fetch = fetch): Promise<SyncRunRow> {
  const id = runId ?? (await startSyncRun(db, kind));
  const stats = newStats();
  const cities = await listCities(db);

  if (kind === 'all' || kind === 'discovery') {
    for (const city of cities) await step(stats, `discovery:${city.slug}`, () => runDiscovery(db, env, city, stats, fetcher));
  }
  if (kind === 'all' || kind === 'refresh') await step(stats, 'refresh', () => runRefresh(db, env, stats, fetcher));
  if (kind === 'all' || kind === 'threads') {
    await step(stats, 'threads-token', () => refreshThreadsToken(db, env, fetcher));
    for (const city of cities) await step(stats, `threads:${city.slug}`, () => runThreads(db, env, city, stats, fetcher));
  }

  const error = [...new Set(stats.errors)].join('; ') || null;
  const notes = [...new Set(stats.notes)];
  console.log(JSON.stringify({ level: error ? 'warn' : 'info', msg: 'sync', kind, runId: id, ...stats, errors: undefined, notes }));
  await db
    .prepare(
      `UPDATE sync_runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), calls_used = ?, places_added = ?, places_updated = ?,
         marked_dead = ?, external_added = ?, threads_status = ?, error = ?, notes = ? WHERE id = ?`,
    )
    .bind(
      stats.callsUsed,
      stats.placesAdded,
      stats.placesUpdated,
      stats.markedDead,
      stats.externalAdded,
      stats.threadsStatus,
      error,
      notes.join('; ') || null,
      id,
    )
    .run();
  return (await db.prepare(`${SYNC_RUN_SELECT} WHERE id = ?`).bind(id).first<SyncRunRow>())!;
}
