import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { takeBudget } from '../src/sync/budget';
import { CAPS } from '../src/sync/config';
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
  const lviv = async () => (await getCityBySlug(env.DB, 'lviv'))!;
  const cursor = async () => (await env.DB.prepare(`SELECT value FROM sync_cursor WHERE key = 'discovery:centre:lviv'`).first<{ value: string }>())?.value;
  const isSearch = (u: string) => u.endsWith('/places:searchText');
  const idOf = (u: string) => u.split('/places/')[1]!.split('?')[0]!;
  const detailsOf = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    displayName: { text: `Шаурма ${id}` },
    location: { latitude: 49.83, longitude: 24.02 },
    formattedAddress: `вул. ${id}, 1`,
    businessStatus: 'OPERATIONAL',
    ...over,
  });
  const query = (init: RequestInit) => JSON.parse(String(init.body)) as { textQuery: string; pageToken?: string };

  beforeEach(async () => {
    await env.DB.prepare(`DELETE FROM sync_cursor`).run();
    await env.DB.prepare(`DELETE FROM budget_usage`).run();
  });

  it('starts at the city centre and walks outwards', async () => {
    const city = await lviv();
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

  it('searches with the free ID-only mask and pays for details only for places it has never seen', async () => {
    await env.DB.prepare(
      `INSERT INTO places (city_id, google_place_id, name, norm_name, lat, lng, last_seen_at) VALUES (1, 'gp-known', 'Відома', 'відома', 49.84, 24.03, '2000-01-01T00:00:00.000Z')`,
    ).run();
    const { f, calls } = fakeFetch((u, init) => {
      if (!isSearch(u)) return detailsOf(idOf(u));
      return query(init).textQuery === 'шаурма' ? { places: [{ id: 'gp-new-1' }, { id: 'gp-known' }] } : {};
    });
    const s1 = newStats();
    const r1 = await runDiscovery(env.DB, genv(), await lviv(), s1, f, 6);
    const searches = calls.filter((c) => isSearch(c.url));
    const details = calls.filter((c) => !isSearch(c.url));
    expect(searches[0]!.mask).toBe('places.id,nextPageToken');
    expect(details.map((c) => idOf(c.url))).toEqual(['gp-new-1']);
    expect(details[0]!.mask).toBe('id,displayName,location,formattedAddress,businessStatus');
    expect(calls).toHaveLength(6);
    expect(r1).toMatchObject({ done: 5, cursor: 5 });
    expect(await cursor()).toBe('5');
    expect(s1).toMatchObject({ placesAdded: 1, placesUpdated: 3, callsUsed: 6 }); // pair 4 (next tile, «шаурма») sees both again: +2 seen, no new details
    const added = await env.DB.prepare(`SELECT name, address, district FROM places WHERE google_place_id = 'gp-new-1'`).first();
    expect(added).toEqual({ name: 'Шаурма gp-new-1', address: 'вул. gp-new-1, 1', district: 'Франківський' });
    const known = await env.DB.prepare(`SELECT last_seen_at AS seen FROM places WHERE google_place_id = 'gp-known'`).first<{ seen: string }>();
    expect(known!.seen > '2026').toBe(true);

    await env.DB.prepare(`DELETE FROM sync_cursor`).run();
    const again = fakeFetch((u, init) => (isSearch(u) && query(init).textQuery === 'шаурма' ? { places: [{ id: 'gp-new-1' }] } : {}));
    const s2 = newStats();
    await runDiscovery(env.DB, genv(), await lviv(), s2, again.f, 6);
    expect(again.calls.every((c) => isSearch(c.url))).toBe(true);
    expect(s2.placesAdded).toBe(0);
  });

  it('follows the next pages of a long result list', async () => {
    const { f, calls } = fakeFetch((u, init) => {
      if (!isSearch(u)) return detailsOf(idOf(u));
      const q = query(init);
      if (q.textQuery !== 'шаурма') return {};
      return q.pageToken === 'p2' ? { places: [{ id: 'gp-page-2' }] } : { places: [{ id: 'gp-page-1' }], nextPageToken: 'p2' };
    });
    const r = await runDiscovery(env.DB, genv(), await lviv(), newStats(), f, 4);
    expect(calls.filter((c) => isSearch(c.url))[1]!.body).toMatchObject({ textQuery: 'шаурма', pageToken: 'p2' });
    expect(r.done).toBe(1);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM places WHERE google_place_id IN ('gp-page-1', 'gp-page-2')`).first()).toEqual({ n: 2 });
  });

  it('does not move past a pair it could not finish, so the next run redoes it', async () => {
    const { f } = fakeFetch((u) => (isSearch(u) ? { places: [{ id: 'gp-unfinished' }] } : detailsOf('gp-unfinished')));
    const r = await runDiscovery(env.DB, genv(), await lviv(), newStats(), f, 1);
    expect(r).toMatchObject({ done: 0, cursor: 0 });
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM places WHERE google_place_id = 'gp-unfinished'`).first()).toEqual({ n: 0 });
  });

  it('remembers closed places so their details are never paid for twice', async () => {
    const handler = (u: string, init: RequestInit) =>
      isSearch(u) ? (query(init).textQuery === 'шаурма' ? { places: [{ id: 'gp-closed' }] } : {}) : detailsOf('gp-closed', { businessStatus: 'CLOSED_PERMANENTLY' });
    const first = fakeFetch(handler);
    await runDiscovery(env.DB, genv(), await lviv(), newStats(), first.f, 3);
    expect(first.calls.filter((c) => !isSearch(c.url))).toHaveLength(1);
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM places WHERE google_place_id = 'gp-closed'`).first()).toEqual({ n: 0 });
    await env.DB.prepare(`DELETE FROM sync_cursor`).run();
    const second = fakeFetch(handler);
    await runDiscovery(env.DB, genv(), await lviv(), newStats(), second.f, 3);
    expect(second.calls.filter((c) => !isSearch(c.url))).toHaveLength(0);
  });

  it('stops without paying once the details budget is used up', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await env.DB.prepare(`INSERT INTO budget_usage (month, sku, calls) VALUES (?, 'places.details_pro', ?)`).bind(month, CAPS['places.details_pro']).run();
    const { f, calls } = fakeFetch((u) => (isSearch(u) ? { places: [{ id: 'gp-no-budget' }] } : detailsOf('gp-no-budget')));
    const s = newStats();
    const r = await runDiscovery(env.DB, genv(), await lviv(), s, f, 10);
    expect(calls.filter((c) => !isSearch(c.url))).toHaveLength(0);
    expect(s.notes).toContain('budget_exhausted:places.details_pro');
    expect(r.done).toBe(0);
  });

  it('skips without calling Google when the search safety cap is reached', async () => {
    const month = new Date().toISOString().slice(0, 7);
    await env.DB.prepare(`INSERT INTO budget_usage (month, sku, calls) VALUES (?, 'places.text_search_ids', 30000)`).bind(month).run();
    const { f, calls } = fakeFetch(() => ({}));
    const s = newStats();
    await runDiscovery(env.DB, genv(), await lviv(), s, f);
    expect(calls).toHaveLength(0);
    expect(s.notes).toContain('budget_exhausted:places.text_search_ids');
  });

  it('records Google errors instead of throwing', async () => {
    const { f } = fakeFetch(() => new Response('boom', { status: 500 }));
    const s = newStats();
    await runDiscovery(env.DB, genv(), await lviv(), s, f);
    expect(s.errors.join(' ')).toMatch(/google 500/);
  });

  it('does nothing without a Places key', async () => {
    const { f, calls } = fakeFetch(() => ({}));
    const s = newStats();
    await runDiscovery(env.DB, env, await lviv(), s, f);
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

  it('rates many places in one go when asked, never-rated places first', async () => {
    await env.DB.prepare(`UPDATE places SET google_last_synced_at = '2000-01-01T00:00:00.000Z' WHERE google_place_id IS NOT NULL`).run();
    for (const id of [5, 6, 7]) await env.DB.prepare(`UPDATE places SET google_place_id = ?, google_last_synced_at = NULL WHERE id = ?`).bind(`gp-bulk-${id}`, id).run();
    const { f, calls } = fakeFetch(() => ({ rating: 4.6, userRatingCount: 80, businessStatus: 'OPERATIONAL', reviews: [] }));
    const s = newStats();
    await runRefresh(env.DB, genv(), s, f, 3);
    expect(calls.map((c) => c.url.split('/places/')[1]!.split('?')[0])).toEqual(['gp-bulk-5', 'gp-bulk-6', 'gp-bulk-7']);
    expect(s.callsUsed).toBe(3);
    const { results } = await env.DB.prepare(`SELECT google_rating AS g FROM places WHERE id IN (5, 6, 7)`).all();
    expect(results).toEqual([{ g: 4.6 }, { g: 4.6 }, { g: 4.6 }]);
  });
});
