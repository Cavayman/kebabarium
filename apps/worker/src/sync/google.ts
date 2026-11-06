/** Minimal Places API (New) client. Field masks are chosen to stay on the Pro (search) and Enterprise+Atmosphere (details) SKUs. */
const BASE = 'https://places.googleapis.com/v1';

export const SKU_SEARCH = 'places.text_search_pro';
export const SKU_DETAILS = 'places.details_enterprise_atmosphere';

const SEARCH_MASK = 'places.id,places.displayName,places.location,places.formattedAddress,places.businessStatus,nextPageToken';
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
    async textSearch(query: string, rect: Rect): Promise<{ places: FoundPlace[] }> {
      const res = await fetcher(`${BASE}/places:searchText`, {
        method: 'POST',
        headers: headers(SEARCH_MASK),
        body: JSON.stringify({ textQuery: query, locationRestriction: { rectangle: rect }, languageCode: 'uk', pageSize: 20 }),
      });
      const data = await parse<{ places?: FoundPlace[] }>(res);
      return { places: data.places ?? [] };
    },
    async details(placeId: string): Promise<PlaceDetails> {
      const res = await fetcher(`${BASE}/places/${encodeURIComponent(placeId)}?languageCode=uk`, { headers: headers(DETAILS_MASK) });
      return parse<PlaceDetails>(res);
    },
  };
}
