import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { takeBudget } from '../src/sync/budget';
import { assignChain, normalizeName } from '../src/sync/chains';
import { districtOf } from '../src/sync/districts';
import { runDiscovery, tilesFor } from '../src/sync/discovery';
import { runRefresh } from '../src/sync/refresh';
import { getCityBySlug } from '../src/db/cities';
import { newStats } from '../src/sync/stats';
import { seedDev } from './helpers';

type Handler = (url: string, init: RequestInit) => unknown;

/** Fake Google: records calls and answers from a handler. */
function fakeFetch(handler: Handler) {
  const calls: { url: string; body: unknown; mask: string | null }[] = [];
  const f = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    calls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, mask: headers.get('X-Goog-FieldMask') });
    const out = handler(url, init);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { f, calls };
}

const genv = () => ({ ...env, GOOGLE_PLACES_KEY: 'test-key' });

beforeAll(seedDev);

describe('budget', () => {
  it('stops at the monthly cap', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await env.DB.prepare('INSERT INTO budget_usage (month, sku, calls) VALUES (?, ?, ?)').bind(month, 'test.sku', 1).run();
    expect(await takeBudget(env.DB, 'test.sku', 2)).toBe(true);
    expect(await takeBudget(env.DB, 'test.sku', 2)).toBe(false);
  });
});

describe('chains & districts', () => {
  it('normalises names', () => {
    expect(normalizeName('Кебаб-Шеф  Сихів!')).toBe('кебаб шеф сихів');
  });

  it('groups two spots with a common brand prefix into a new chain', async () => {
    const ins = (id: number, name: string) =>
      env.DB.prepare(`INSERT INTO places (id, city_id, name, norm_name, lat, lng) VALUES (?, 1, ?, ?, 49.84, 24.03)`)
        .bind(id, name, normalizeName(name))
        .run();
    await ins(101, 'Doner Point Ринок');
    await ins(102, 'DONER POINT Сихів');
    await assignChain(env.DB, 102);
    const rows = await env.DB.prepare(`SELECT p.id, c.name FROM places p JOIN chains c ON c.id = p.chain_id WHERE p.id IN (101, 102)`).all();
    expect(rows.results).toEqual([
      { id: 101, name: 'DONER POINT' },
      { id: 102, name: 'DONER POINT' },
    ]);
  });

  it('does not chain generic names like "Шаурма на …"', async () => {
    await env.DB.prepare(`INSERT INTO places (id, city_id, name, norm_name, lat, lng) VALUES (103, 1, 'Шаурма на Стрийській', 'шаурма на стрийській', 49.8, 24.0)`).run();
    await assignChain(env.DB, 103);
    expect((await env.DB.prepare('SELECT chain_id AS c FROM places WHERE id = 103').first())!.c).toBeNull();
  });

  it('joins an existing chain', async () => {
    await env.DB.prepare(`INSERT INTO places (id, city_id, name, norm_name, lat, lng) VALUES (104, 1, 'Кебаб-Шеф Левандівка', 'кебаб шеф левандівка', 49.85, 23.96)`).run();
    await assignChain(env.DB, 104);
    expect((await env.DB.prepare('SELECT chain_id AS c FROM places WHERE id = 104').first())!.c).toBe(1);
  });

  it('resolves districts', () => {
    expect(districtOf('lviv', 49.796, 24.056)).toBe('Сихівський');
    expect(districtOf('lviv', 49.8418, 24.0318)).toBe('Галицький');
    expect(districtOf('kyiv', 50.45, 30.52)).toBeNull();
  });
});

describe('discovery', () => {
  it('starts at the city centre and walks outwards', async () => {
    const city = (await getCityBySlug(env.DB, 'lviv'))!;
    const tiles = tilesFor(city);
    const first = tiles[0]!;
    expect(first.low.latitude).toBeLessThanOrEqual(city.centerLat);
    expect(first.high.latitude).toBeGreaterThanOrEqual(city.centerLat);
    expect(first.low.longitude).toBeLessThanOrEqual(city.centerLng);
    expect(first.high.longitude).toBeGreaterThanOrEqual(city.centerLng);
    const dist = (r: (typeof tiles)[number]) =>
      Math.hypot((r.low.latitude + r.high.latitude) / 2 - city.centerLat, ((r.low.longitude + r.high.longitude) / 2 - city.centerLng) * Math.cos((city.centerLat * Math.PI) / 180));
    for (let i = 1; i < tiles.length; i++) expect(dist(tiles[i]!)).toBeGreaterThanOrEqual(dist(tiles[i - 1]!));
  });

  it('walks tiles in rotation and inserts new places once', async () => {
    const city = (await getCityBySlug(env.DB, 'lviv'))!;
    expect(tilesFor(city).length).toBeGreaterThan(50);
    const { f, calls } = fakeFetch((_u, init) => {
      const q = JSON.parse(String(init.body)).textQuery as string;
      return q === 'шаурма'
        ? { places: [{ id: 'gp-new-1', displayName: { text: 'Шаурма Нова' }, location: { latitude: 49.83, longitude: 24.02 }, formattedAddress: 'вул. Нова, 1', businessStatus: 'OPERATIONAL' }] }
        : { places: [] };
    });
    const s1 = newStats();
    await runDiscovery(env.DB, genv(), city, s1, f);
    expect(calls).toHaveLength(6);
    expect(calls[0]!.mask).toContain('places.id');
    expect(calls[0]!.mask).not.toContain('rating');
    expect(s1.placesAdded).toBe(1);
    const cursor = await env.DB.prepare(`SELECT value FROM sync_cursor WHERE key = 'discovery:centre:lviv'`).first<{ value: string }>();
    expect(cursor!.value).toBe('6');

    const s2 = newStats();
    await runDiscovery(env.DB, genv(), city, s2, f);
    expect(s2.placesAdded).toBe(0);
    const n = await env.DB.prepare(`SELECT COUNT(*) AS n, MAX(district) AS d FROM places WHERE google_place_id = 'gp-new-1'`).first();
    expect(n).toEqual({ n: 1, d: 'Франківський' });
  });

  it('skips without calling Google when the budget is exhausted', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await env.DB.prepare(`INSERT OR REPLACE INTO budget_usage (month, sku, calls) VALUES (?, 'places.text_search_pro', 4500)`).bind(month).run();
    const { f, calls } = fakeFetch(() => ({ places: [] }));
    const s = newStats();
    await runDiscovery(env.DB, genv(), (await getCityBySlug(env.DB, 'lviv'))!, s, f);
    expect(calls).toHaveLength(0);
    expect(s.notes).toContain('budget_exhausted:places.text_search_pro');
    await env.DB.prepare(`DELETE FROM budget_usage WHERE sku = 'places.text_search_pro'`).run();
  });

  it('records Google errors instead of throwing', async () => {
    const { f } = fakeFetch(() => new Response('boom', { status: 500 }));
    const s = newStats();
    await runDiscovery(env.DB, genv(), (await getCityBySlug(env.DB, 'lviv'))!, s, f);
    expect(s.errors.join(' ')).toMatch(/google 500/);
  });

  it('does nothing without a Places key', async () => {
    const { f, calls } = fakeFetch(() => ({ places: [] }));
    const s = newStats();
    await runDiscovery(env.DB, env, (await getCityBySlug(env.DB, 'lviv'))!, s, f);
    expect(calls).toHaveLength(0);
    expect(s.notes).toContain('google_not_configured');
  });
});

describe('refresh', () => {
  it('updates ratings, stores reviews and marks permanently closed places dead', async () => {
    await env.DB.prepare(`UPDATE places SET google_place_id = 'gp-4', google_last_synced_at = NULL WHERE id = 4`).run();
    await env.DB.prepare(`UPDATE places SET google_last_synced_at = '2000-01-01T00:00:00.000Z' WHERE google_place_id IS NOT NULL AND id != 4`).run();
    const { f, calls } = fakeFetch(() => ({
      rating: 3.1,
      userRatingCount: 150,
      businessStatus: 'CLOSED_PERMANENTLY',
      reviews: [
        { name: 'places/gp-4/reviews/r1', rating: 2, text: { text: 'закрились' }, authorAttribution: { displayName: 'Ira', uri: 'https://maps.google.com/u/1' }, publishTime: '2026-11-01T10:00:00Z' },
      ],
    }));
    const s = newStats();
    await runRefresh(env.DB, genv(), s, f);
    expect(calls[0]!.url).toContain('/places/gp-4');
    expect(calls[0]!.mask).toContain('reviews');
    const p = await env.DB.prepare(`SELECT status, dead_reason AS r, google_rating AS g, google_rating_count AS n FROM places WHERE id = 4`).first();
    expect(p).toEqual({ status: 'dead', r: 'google_closed', g: 3.1, n: 150 });
    const rev = await env.DB.prepare(`SELECT author, text, stars FROM external_reviews WHERE external_id = 'places/gp-4/reviews/r1'`).first();
    expect(rev).toEqual({ author: 'Ira', text: 'закрились', stars: 2 });
    expect(s.markedDead).toBe(1);
  });

  it('flags long-unseen inactive places as dead candidates', async () => {
    await env.DB.prepare(`UPDATE places SET last_seen_at = '2000-01-01T00:00:00.000Z', google_place_id = 'gp-9' WHERE id = 9`).run();
    await env.DB.prepare(`UPDATE ratings SET created_at = '2000-01-01T00:00:00.000Z', updated_at = '2000-01-01T00:00:00.000Z' WHERE place_id = 9`).run();
    const { f } = fakeFetch(() => ({ rating: 3.4, userRatingCount: 22, businessStatus: 'OPERATIONAL', reviews: [] }));
    await runRefresh(env.DB, genv(), newStats(), f);
    expect((await env.DB.prepare('SELECT dead_candidate AS d, status FROM places WHERE id = 9').first())).toEqual({ d: 1, status: 'open' });
  });
});
