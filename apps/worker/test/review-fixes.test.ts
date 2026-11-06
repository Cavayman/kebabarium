import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { runRefresh } from '../src/sync/refresh';
import { runSync } from '../src/sync/run';
import { newStats } from '../src/sync/stats';
import { cookieFrom, googleIdToken, MUTATE_HEADERS, seedDev } from './helpers';

beforeAll(seedDev);

describe('refresh does not stall on a broken place', () => {
  it('moves past a place Google no longer knows and flags it as a dead candidate', async () => {
    await env.DB.prepare(`UPDATE places SET google_place_id = 'gp-gone', google_last_synced_at = NULL WHERE id = 4`).run();
    await env.DB.prepare(`UPDATE places SET google_place_id = 'gp-ok', google_last_synced_at = '2001-01-01T00:00:00.000Z' WHERE id = 5`).run();
    await env.DB.prepare(`UPDATE places SET google_last_synced_at = '2020-01-01T00:00:00.000Z' WHERE google_place_id IS NOT NULL AND id NOT IN (4, 5)`).run();
    const seen: string[] = [];
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes('gp-gone')) return new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 });
      return new Response(JSON.stringify({ rating: 4.1, userRatingCount: 10, businessStatus: 'OPERATIONAL', reviews: [] }));
    }) as typeof fetch;
    const e = { ...env, GOOGLE_PLACES_KEY: 'k' };
    await runRefresh(env.DB, e, newStats(), f);
    await runRefresh(env.DB, e, newStats(), f);
    expect(seen.filter((u) => u.includes('gp-gone'))).toHaveLength(1);
    expect(seen.some((u) => u.includes('gp-ok'))).toBe(true);
    expect((await env.DB.prepare('SELECT dead_candidate AS d FROM places WHERE id = 4').first())!.d).toBe(1);
  });
});

describe('sync runs explain themselves', () => {
  it('stores notes such as a missing key in sync_runs', async () => {
    const run = await runSync(env.DB, env, 'discovery');
    expect(run.notes).toContain('google_not_configured');
  });
});

describe('bans also stop edits', () => {
  it('refuses a banned user editing an existing rating', async () => {
    const credential = await googleIdToken({ sub: 'banned-sub', email: 'banned@example.com' });
    const login = await SELF.fetch('http://kb.test/api/auth/google', { method: 'POST', headers: MUTATE_HEADERS, body: JSON.stringify({ credential }) });
    const cookie = cookieFrom(login, 'kb_session')!;
    const post = (body: unknown) =>
      SELF.fetch('http://kb.test/api/places/9/reviews', {
        method: 'POST',
        headers: { ...MUTATE_HEADERS, Cookie: cookie, 'CF-Connecting-IP': '198.19.0.9' },
        body: JSON.stringify(body),
      });
    expect((await post({ stars: 4 })).status).toBe(201);
    const me = (await (await SELF.fetch('http://kb.test/api/me', { headers: { Cookie: cookie } })).json()) as { id: number };
    await env.DB.prepare(`INSERT INTO abuse_bans (kind, value_hash, reason) VALUES ('user', ?, 'test')`).bind(String(me.id)).run();

    const again = await post({ stars: 1, text: 'помста' });
    expect(again.status).toBe(403);
    const put = await SELF.fetch('http://kb.test/api/places/9/rating', {
      method: 'PUT',
      headers: { ...MUTATE_HEADERS, Cookie: cookie, 'CF-Connecting-IP': '198.19.0.9' },
      body: JSON.stringify({ stars: 1 }),
    });
    expect(put.status).toBe(403);
    expect((await env.DB.prepare('SELECT stars FROM ratings WHERE place_id = 9 AND user_id = ?').bind(me.id).first())!.stars).toBe(4);
  });
});
