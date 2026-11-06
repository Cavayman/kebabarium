export type PlaceStatus = 'open' | 'closed_temp' | 'dead' | 'hidden';

export interface PlaceRow {
  id: number;
  cityId: number;
  googlePlaceId: string | null;
  name: string;
  normName: string;
  address: string | null;
  lat: number;
  lng: number;
  district: string | null;
  chainId: number | null;
  chainName: string | null;
  logoUrl: string | null;
  status: PlaceStatus;
  deadReason: string | null;
  deadCandidate: boolean;
  movedToPlaceId: number | null;
  googleRating: number | null;
  googleRatingCount: number | null;
  googleLastSyncedAt: string | null;
  lastSeenAt: string | null;
}

export const PLACE_SELECT = `SELECT p.id, p.city_id AS cityId, p.google_place_id AS googlePlaceId, p.name, p.norm_name AS normName,
  p.address, p.lat, p.lng, p.district, p.chain_id AS chainId, c.name AS chainName,
  COALESCE(p.logo_url, c.logo_url) AS logoUrl, p.status, p.dead_reason AS deadReason, p.dead_candidate AS deadCandidate,
  p.moved_to_place_id AS movedToPlaceId, p.google_rating AS googleRating, p.google_rating_count AS googleRatingCount,
  p.google_last_synced_at AS googleLastSyncedAt, p.last_seen_at AS lastSeenAt
  FROM places p LEFT JOIN chains c ON c.id = p.chain_id`;

type Raw = Omit<PlaceRow, 'deadCandidate'> & { deadCandidate: number };
export const mapPlace = (r: Raw): PlaceRow => ({ ...r, deadCandidate: r.deadCandidate === 1 });

/** All non-hidden places of a city (dead ones included — they render as grey stubs). */
export async function listPlaces(db: D1Database, cityId: number): Promise<PlaceRow[]> {
  const { results } = await db
    .prepare(`${PLACE_SELECT} WHERE p.city_id = ? AND p.status != 'hidden' ORDER BY p.id`)
    .bind(cityId)
    .all<Raw>();
  return results.map(mapPlace);
}

export async function getPlace(db: D1Database, id: number): Promise<PlaceRow | null> {
  const r = await db.prepare(`${PLACE_SELECT} WHERE p.id = ?`).bind(id).first<Raw>();
  return r ? mapPlace(r) : null;
}
