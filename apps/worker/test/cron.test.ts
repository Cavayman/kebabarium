import { createExecutionContext, createScheduledController, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { runSync } from '../src/sync/run';
import { seedDev } from './helpers';

const threadsPosts = { data: [{ id: 'cron-t-1', text: 'шаурма вогонь', username: 'cron', permalink: 'https://threads.net/x', timestamp: '2026-11-06T10:00:00+0000' }] };

function routeFetch() {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('places.googleapis.com')) return new Response('quota', { status: 500 });
    if (url.includes('graph.threads.net/v1.0/keyword_search')) return new Response(JSON.stringify(threadsPosts));
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
}

beforeAll(seedDev);
afterEach(() => vi.restoreAllMocks());

describe('runSync', () => {
  it('keeps going when Google fails and records everything in sync_runs', async () => {
    const run = await runSync(env.DB, { ...env, GOOGLE_PLACES_KEY: 'k', THREADS_TOKEN: 't' }, 'all', undefined, routeFetch());
    expect(run.finishedAt).not.toBeNull();
    expect(run.error).toMatch(/google 500/);
    expect(run.threadsStatus).toBe('ok');
    expect(run.externalAdded).toBe(1);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM external_reviews WHERE external_id = 'cron-t-1'`).first()).toEqual({ n: 1 });
  });
});

describe('scheduled handler', () => {
  it('publishes due reviews on the 10-minute cron and does not sync', async () => {
    await env.DB.prepare(
      `INSERT INTO ratings (id, place_id, stars, is_anonymous, weight, status, publish_at) VALUES (900, 4, 4, 1, 0.5, 'pending', '2000-01-01T00:00:00.000Z')`,
    ).run();
    const before = (await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_runs').first<{ n: number }>())!.n;
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: '*/10 * * * *' }), env, ctx);
    await waitOnExecutionContext(ctx);
    expect((await env.DB.prepare('SELECT status FROM ratings WHERE id = 900').first())!.status).toBe('published');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM sync_runs').first<{ n: number }>())!.n).toBe(before);
  });

  it('runs the full sync on the hourly cron', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(routeFetch());
    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController({ cron: '0 * * * *' }), { ...env, THREADS_TOKEN: 't' }, ctx);
    await waitOnExecutionContext(ctx);
    const last = await env.DB.prepare(`SELECT kind, finished_at AS f FROM sync_runs ORDER BY id DESC LIMIT 1`).first<{ kind: string; f: string | null }>();
    expect(last).toMatchObject({ kind: 'all' });
    expect(last!.f).not.toBeNull();
  });
});
