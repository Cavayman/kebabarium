import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { getCityBySlug } from '../src/db/cities';
import { newStats } from '../src/sync/stats';
import { refreshThreadsToken, runThreads } from '../src/sync/threads';
import { seedDev } from './helpers';

function fakeFetch(handler: (url: URL) => unknown) {
  const calls: URL[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url);
    const out = handler(url);
    return out instanceof Response ? out : new Response(JSON.stringify(out));
  }) as typeof fetch;
  return { f, calls };
}

const posts = {
  data: [
    { id: 't-100', text: 'Найкраща шаурма на Коновальця, без питань', username: 'foodie', permalink: 'https://www.threads.net/@foodie/post/1', timestamp: '2026-11-05T10:00:00+0000' },
    { id: 't-101', text: 'де взяти шаурму вночі?', username: 'nightowl', permalink: 'https://www.threads.net/@nightowl/post/2', timestamp: '2026-11-05T11:00:00+0000' },
  ],
};

const tenv = () => ({ ...env, THREADS_TOKEN: 'th-token' });
let lviv: Awaited<ReturnType<typeof getCityBySlug>>;

beforeAll(async () => {
  await seedDev();
  lviv = await getCityBySlug(env.DB, 'lviv');
});

describe('threads mentions', () => {
  it('searches recent posts per query + city and stores each post once, linking known places', async () => {
    const { f, calls } = fakeFetch(() => posts);
    const s1 = newStats();
    await runThreads(env.DB, tenv(), lviv!, s1, f);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.pathname).toBe('/v1.0/keyword_search');
    expect(calls[0]!.searchParams.get('q')).toBe('шаурма Львів');
    expect(calls[0]!.searchParams.get('search_type')).toBe('RECENT');
    expect(s1).toMatchObject({ externalAdded: 2, threadsStatus: 'ok' });

    const s2 = newStats();
    await runThreads(env.DB, tenv(), lviv!, s2, f);
    expect(s2.externalAdded).toBe(0);

    const linked = await env.DB.prepare(`SELECT place_id AS p, author, url FROM external_reviews WHERE external_id = 't-100'`).first();
    expect(linked).toEqual({ p: 1, author: '@foodie', url: 'https://www.threads.net/@foodie/post/1' });
    expect((await env.DB.prepare(`SELECT place_id AS p FROM external_reviews WHERE external_id = 't-101'`).first())!.p).toBeNull();
  });

  it('is unavailable without a token and calls nothing', async () => {
    const { f, calls } = fakeFetch(() => posts);
    const s = newStats();
    await runThreads(env.DB, env, lviv!, s, f);
    expect(calls).toHaveLength(0);
    expect(s.threadsStatus).toBe('unavailable');
    expect(s.notes).toContain('threads_not_configured');
  });

  it('marks Threads unavailable on an auth error without throwing', async () => {
    const { f } = fakeFetch(() => new Response('{"error":{"message":"bad token"}}', { status: 401 }));
    const s = newStats();
    await runThreads(env.DB, tenv(), lviv!, s, f);
    expect(s.threadsStatus).toBe('unavailable');
    expect(s.errors.join(' ')).toMatch(/threads 401/);
  });

  it('refreshes a long-lived token that expires within a week and uses it next time', async () => {
    const soon = new Date(Date.now() + 2 * 86400e3).toISOString();
    await env.DB.prepare(`INSERT OR REPLACE INTO sync_cursor (key, value) VALUES ('threads:token', ?)`)
      .bind(JSON.stringify({ token: 'old', expiresAt: soon }))
      .run();
    const { f, calls } = fakeFetch(() => ({ access_token: 'fresh', token_type: 'bearer', expires_in: 5184000 }));
    await refreshThreadsToken(env.DB, tenv(), f);
    expect(calls[0]!.pathname).toBe('/refresh_access_token');
    expect(calls[0]!.searchParams.get('access_token')).toBe('old');
    const stored = JSON.parse((await env.DB.prepare(`SELECT value FROM sync_cursor WHERE key = 'threads:token'`).first<{ value: string }>())!.value);
    expect(stored.token).toBe('fresh');
    expect(Date.parse(stored.expiresAt)).toBeGreaterThan(Date.now() + 50 * 86400e3);

    const { f: f2, calls: c2 } = fakeFetch(() => ({ data: [] }));
    await runThreads(env.DB, tenv(), lviv!, newStats(), f2);
    expect(c2[0]!.searchParams.get('access_token')).toBe('fresh');
  });
});
