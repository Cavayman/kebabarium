import type { Env } from '../env';
import type { SyncKind } from './config';

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
}

export const SYNC_RUN_SELECT = `SELECT id, kind, started_at AS startedAt, finished_at AS finishedAt, calls_used AS callsUsed,
  places_added AS placesAdded, places_updated AS placesUpdated, marked_dead AS markedDead, external_added AS externalAdded,
  threads_status AS threadsStatus, error FROM sync_runs`;

export async function startSyncRun(db: D1Database, kind: SyncKind): Promise<number> {
  const r = await db.prepare(`INSERT INTO sync_runs (kind) VALUES (?) RETURNING id`).bind(kind).first<{ id: number }>();
  return r!.id;
}

/** Placeholder until the sync task: closes the run without doing work. */
export async function runSync(db: D1Database, _env: Env, _kind: SyncKind, runId: number): Promise<void> {
  await db.prepare(`UPDATE sync_runs SET finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).bind(runId).run();
}
