import { env, SELF } from 'cloudflare:test';
import type { CityStats, FeedResponse, LeaderboardRow, NearResponse, PlaceDetail, PlaceSummary, RuntimeConfig } from '@kebabarium/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { seedDev } from './helpers';

const get = async <T>(path: string) => {
  const res = await SELF.fetch(`http://kb.test${path}`);
  return { res, body: (await res.json()) as T };
};

beforeAll(seedDev);

describe('cities & places', () => {
  it('lists Lviv with its spot count', async () => {
    const { body } = await get<{ slug: string; spots: number }[]>('/api/cities');
    expect(body).toEqual([expect.objectContaining({ slug: 'lviv', spots: 13 })]);
  });

  it('returns combined scores for every place', async () => {
    const { res, body } = await get<PlaceSummary[]>('/api/cities/lviv/places');
    expect(res.headers.get('cache-control')).toContain('max-age=30');
    expect(body).toHaveLength(13);
    const kon = body.find((p) => p.name === 'Шаурма на Коновальця')!;
    expect(kon.score).toBe(4.8);
    expect(kon.googleAttribution).toBe(true);
    expect(kon.reviewCount).toBe(212 + 7);
    const naukova = body.find((p) => p.id === 11)!;
    expect(naukova).toMatchObject({ score: 4.4, googleAttribution: false });
  });

  it('gives a null score (never NaN) to a place nobody rated', async () => {
    const { body } = await get<PlaceSummary[]>('/api/cities/lviv/places');
    expect(body.find((p) => p.id === 13)).toMatchObject({ score: null, ourScore: null, reviewCount: 0 });
  });

  it('404s an unknown city', async () => {
    const { res, body } = await get<{ error: { code: string } }>('/api/cities/atlantis/places');
    expect(res.status).toBe(404);
    expect(body.error.code).toBe('city_not_found');
  });

  it('returns place detail with the move chain and latest reviews', async () => {
    const { body } = await get<PlaceDetail>('/api/places/1');
    expect(body.movedFrom).toEqual([{ id: 12, name: 'Шаурма на Патона', address: 'вул. Патона, 3' }]);
    expect(body.reviews.length).toBeLessThanOrEqual(5);
    expect(body.reviews[0]!.text).toBe('ті самі, що на Патона. лаваш як треба');
    const { body: old } = await get<PlaceDetail>('/api/places/12');
    expect(old.movedTo).toEqual({ id: 1, name: 'Шаурма на Коновальця' });
  });

  it('includes chain score on a chain spot', async () => {
    const { body } = await get<PlaceDetail>('/api/places/3');
    expect(body).toMatchObject({ chainName: 'Кебаб-Шеф', chainScore: 4.4, chainSpots: 2 });
  });

  it('returns up to `limit` reviews on request', async () => {
    const { body } = await get<PlaceDetail>('/api/places/1?limit=50');
    expect(body.reviews.length).toBe(7);
  });

  it('404s an unknown place', async () => {
    const { res } = await get('/api/places/99999');
    expect(res.status).toBe(404);
  });
});

describe('leaderboards', () => {
  it('ranks spots by combined score and skips unscored ones', async () => {
    const { body } = await get<LeaderboardRow[]>('/api/cities/lviv/leaderboard?kind=spots');
    expect(body.slice(0, 2).map((r) => [r.name, r.value])).toEqual([
      ['Шаурма на Коновальця', 4.8],
      ['Doner біля Ринку', 4.6],
    ]);
    expect(body.every((r) => r.value != null && !Number.isNaN(r.value))).toBe(true);
    expect(body.some((r) => r.name === 'Шаурма на Патона')).toBe(false);
  });

  it('ranks chains by the average of their spots', async () => {
    const { body } = await get<LeaderboardRow[]>('/api/cities/lviv/leaderboard?kind=chains');
    expect(body[0]).toMatchObject({ name: 'Кебаб-Шеф', value: 4.4, extra: '2' });
  });

  it('ranks districts with two decimals', async () => {
    const { body } = await get<LeaderboardRow[]>('/api/cities/lviv/leaderboard?kind=districts');
    expect(body.length).toBeGreaterThan(2);
    expect(body[0]!.value).toBeGreaterThanOrEqual(body[1]!.value);
  });

  it('excludes tasters who hid themselves', async () => {
    await env.DB.prepare('UPDATE users SET hide_from_leaderboard = 1 WHERE id = 5').run();
    const { body } = await get<LeaderboardRow[]>('/api/cities/lviv/leaderboard?kind=tasters');
    expect(body.map((r) => r.name)).not.toContain('sasha');
    expect(body[0]!.value).toBeGreaterThanOrEqual(body.at(-1)!.value);
    await env.DB.prepare('UPDATE users SET hide_from_leaderboard = 0 WHERE id = 5').run();
  });

  it('rejects an unknown kind', async () => {
    const { res } = await get('/api/cities/lviv/leaderboard?kind=nope');
    expect(res.status).toBe(400);
  });
});

describe('feed', () => {
  it('filters by source', async () => {
    const { res, body } = await get<FeedResponse>('/api/cities/lviv/feed?source=threads');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body.items.length).toBe(2);
    expect(body.items.every((i) => i.source === 'threads')).toBe(true);
  });

  it('returns only items newer than since, newest first, with emoji', async () => {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { body } = await get<FeedResponse>(`/api/cities/lviv/feed?since=${encodeURIComponent(since)}`);
    expect(body.items.length).toBeGreaterThanOrEqual(4);
    expect(body.items.every((i) => i.createdAt > since)).toBe(true);
    expect(body.items[0]!.createdAt >= body.items[1]!.createdAt).toBe(true);
    expect(body.items.find((i) => i.stars === 5)?.emoji).toBe('🤤');
  });

  it('returns user text verbatim (escaping is the client job)', async () => {
    const text = '<script>alert(1)</script> 🥙 שלום';
    await env.DB.prepare(
      "INSERT INTO ratings (place_id, user_id, stars, text, is_anonymous, weight, status) VALUES (9, 2, 3, ?, 0, 1, 'published')",
    )
      .bind(text)
      .run();
    const { body } = await get<FeedResponse>('/api/cities/lviv/feed?source=ours');
    expect(body.items[0]!.text).toBe(text);
  });
});

describe('stats, near, config', () => {
  it('summarises the city', async () => {
    const { body } = await get<CityStats>('/api/cities/lviv/stats');
    expect(body).toMatchObject({ city: 'Львів', spots: 13, dead: 1, open: 12 });
    expect(body.reviews).toBeGreaterThan(40);
  });

  it('finds open spots near a point, best first', async () => {
    const { body } = await get<NearResponse>('/api/places/near?lat=49.8375&lng=24.0245');
    expect(body.radiusKm).toBe(1);
    expect(body.autoWidened).toBe(false);
    expect(body.items.length).toBeGreaterThanOrEqual(3);
    const scores = body.items.map((i) => i.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(body.items[0]).toMatchObject({ name: 'Шаурма на Коновальця' });
    expect(body.items[0]!.walkMin).toBe(Math.max(1, Math.round(body.items[0]!.distanceM / 80)));
  });

  it('auto-widens to 5 km when few spots are close', async () => {
    const { body } = await get<NearResponse>('/api/places/near?lat=49.80&lng=24.10');
    expect(body).toMatchObject({ radiusKm: 5, autoWidened: true });
    expect(body.items.map((i) => i.id).sort((a, b) => a - b)).toEqual([3, 10]);
  });

  it('respects an explicit radius without widening', async () => {
    const { body } = await get<NearResponse>('/api/places/near?lat=49.80&lng=24.10&r=2');
    expect(body).toMatchObject({ radiusKm: 2, autoWidened: false, items: [] });
  });

  it('returns nothing outside every active city', async () => {
    const { body } = await get<NearResponse>('/api/places/near?lat=50.45&lng=30.52');
    expect(body.items).toEqual([]);
  });

  it('serves the dev map provider when no maps key is configured', async () => {
    const { body } = await get<RuntimeConfig>('/api/config');
    expect(body).toMatchObject({ mapProvider: 'maplibre', mapsBrowserKey: null });
  });
});
