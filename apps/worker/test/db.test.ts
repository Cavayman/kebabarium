import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { getCityBySlug, listCities } from '../src/db/cities';
import { listPlaces } from '../src/db/places';
import { insertRating } from '../src/db/ratings';
import { incrementBudget } from '../src/db/budget';
import { seedDev } from './helpers';

beforeAll(seedDev);

describe('db layer', () => {
  it('has Lviv and Sumy as active cities', async () => {
    const lviv = await getCityBySlug(env.DB, 'lviv');
    expect(lviv).toMatchObject({ slug: 'lviv', name: 'Львів', centerLat: 49.832, centerLng: 24.022 });
    expect((await listCities(env.DB)).map((c) => c.slug)).toEqual(['lviv', 'sumy']);
    expect(await getCityBySlug(env.DB, 'sumy')).toMatchObject({ name: 'Суми', bbox: [34.7, 50.85, 34.9, 50.96] });
  });

  it('lists the 13 dev-seed places for Lviv', async () => {
    const lviv = await getCityBySlug(env.DB, 'lviv');
    const places = await listPlaces(env.DB, lviv!.id);
    expect(places).toHaveLength(13);
    expect(places.find((p) => p.name === 'Шаурма на Патона')).toMatchObject({ status: 'dead', movedToPlaceId: 1 });
  });

  it('rejects a second visible rating by the same user for the same place', async () => {
    const base = { placeId: 7, userId: 1, stars: 4, isAnonymous: false, weight: 1, status: 'published' as const };
    await insertRating(env.DB, base);
    await expect(insertRating(env.DB, { ...base, stars: 5 })).rejects.toThrow();
  });

  it('counts budget usage per month and sku', async () => {
    expect(await incrementBudget(env.DB, '2026-11', 'places.text_search_pro')).toBe(1);
    expect(await incrementBudget(env.DB, '2026-11', 'places.text_search_pro')).toBe(2);
    expect(await incrementBudget(env.DB, '2026-12', 'places.text_search_pro')).toBe(1);
  });
});
