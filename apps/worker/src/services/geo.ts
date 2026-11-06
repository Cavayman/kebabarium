import type { NearItem, NearResponse } from '@kebabarium/shared';
import { listCities } from '../db/cities';
import { loadCityPlaces } from './places';

const R_EARTH_M = 6371000;
export const RADII = [1, 2, 5] as const;
export type Radius = (typeof RADII)[number];
const MIN_RESULTS = 3;
const WALK_M_PER_MIN = 80;

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(s));
}

/** Open spots near a point, best score first. Without `r` the radius starts at 1 km and widens to 2 → 5 km. */
export async function findNear(db: D1Database, point: { lat: number; lng: number }, r?: Radius): Promise<NearResponse> {
  const cities = await listCities(db);
  const city = cities.find(
    (c) => point.lng >= c.bbox[0] && point.lat >= c.bbox[1] && point.lng <= c.bbox[2] && point.lat <= c.bbox[3],
  );
  if (!city) return { radiusKm: r ?? 5, autoWidened: false, items: [] };

  const all: NearItem[] = (await loadCityPlaces(db, city.id))
    .filter((p) => p.row.status === 'open')
    .map((p) => {
      const distanceM = Math.round(haversineM(point, p.row));
      return { ...p.summary, distanceM, walkMin: Math.max(1, Math.round(distanceM / WALK_M_PER_MIN)) };
    });
  const within = (km: number) =>
    all
      .filter((p) => p.distanceM <= km * 1000)
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.distanceM - b.distanceM);

  if (r) return { radiusKm: r, autoWidened: false, items: within(r) };
  for (const km of RADII) {
    const items = within(km);
    if (items.length >= MIN_RESULTS || km === 5) return { radiusKm: km, autoWidened: km !== 1, items };
  }
  /* c8 ignore next */
  return { radiusKm: 5, autoWidened: true, items: within(5) };
}
