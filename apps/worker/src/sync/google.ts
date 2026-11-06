/**
 * Minimal Places API (New) client. Each field mask pins one billing SKU:
 * - search: ids only → "Text Search Essentials (IDs Only)", free without a monthly cap;
 * - basics: name/location/address/status of a newly found place → "Place Details Pro" (5 000 free/month);
 * - details: rating + reviews for the refresh → "Place Details Enterprise + Atmosphere" (1 000 free/month).
 */
const BASE = 'https://places.googleapis.com/v1';

export const SKU_SEARCH = 'places.text_search_ids';
export const SKU_BASICS = 'places.details_pro';
export const SKU_DETAILS = 'places.details_enterprise_atmosphere';

const SEARCH_MASK = 'places.id,nextPageToken';
const BASICS_MASK = 'id,displayName,location,formattedAddress,businessStatus';
const DETAILS_MASK = 'rating,userRatingCount,businessStatus,reviews';

export type BusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';

export interface FoundPlace {
  id: string;
  displayName?: { text: string };
  location?: { latitude: number; longitude: number };
  formattedAddress?: string;
  businessStatus?: BusinessStatus;
}

export interface GoogleReview {
  name: string;
  rating?: number;
  text?: { text: string };
  originalText?: { text: string };
  authorAttribution?: { displayName?: string; uri?: string };
  publishTime?: string;
  googleMapsUri?: string;
}

export interface PlaceDetails {
  rating?: number;
  userRatingCount?: number;
  businessStatus?: BusinessStatus;
  reviews?: GoogleReview[];
}

export class GoogleError extends Error {
  constructor(public status: number, body: string) {
    super(`google ${status}: ${body.slice(0, 200)}`);
  }
}

export interface Rect {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}

export function googlePlaces(key: string, fetcher: typeof fetch = fetch) {
  const headers = (mask: string) => ({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask });
  const parse = async <T>(res: Response): Promise<T> => {
    if (!res.ok) throw new GoogleError(res.status, await res.text());
    return (await res.json()) as T;
  };
  return {
    /** One page of place ids; pass the returned token to get the next page (Google stops at 60 results). */
    async searchIds(query: string, rect: Rect, pageToken?: string): Promise<{ ids: string[]; nextPageToken?: string }> {
      const res = await fetcher(`${BASE}/places:searchText`, {
        method: 'POST',
        headers: headers(SEARCH_MASK),
        body: JSON.stringify({ textQuery: query, locationRestriction: { rectangle: rect }, languageCode: 'uk', pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      });
      const data = await parse<{ places?: { id: string }[]; nextPageToken?: string }>(res);
      return { ids: (data.places ?? []).map((p) => p.id), nextPageToken: data.nextPageToken || undefined };
    },
    async basics(placeId: string): Promise<FoundPlace> {
      const res = await fetcher(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=uk`, { headers: headers(BASICS_MASK) });
      return parse<FoundPlace>(res);
    },
    async details(placeId: string): Promise<PlaceDetails> {
      const res = await fetcher(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=uk`, { headers: headers(DETAILS_MASK) });
      return parse<PlaceDetails>(res);
    },
  };
}
