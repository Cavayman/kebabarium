// API contract shared by the Worker and the Angular app.

export type Lang = 'uk' | 'en';
export type PlaceStatus = 'open' | 'closed_temp' | 'dead' | 'hidden';
export type ReviewSource = 'ours' | 'google' | 'threads';
export type LeaderboardKind = 'spots' | 'chains' | 'districts' | 'tasters';

export interface City {
  id: number;
  slug: string;
  name: string;
  nameEn: string | null;
  center: { lat: number; lng: number };
  zoom: number;
  bbox: [number, number, number, number];
  spots: number;
}

export interface PlaceSummary {
  id: number;
  name: string;
  lat: number;
  lng: number;
  district: string | null;
  address: string | null;
  status: PlaceStatus;
  deadReason: string | null;
  movedToPlaceId: number | null;
  chainId: number | null;
  chainName: string | null;
  logoUrl: string | null;
  /** Combined score, 1 decimal, null when nothing is known. */
  score: number | null;
  ourScore: number | null;
  ourCount: number;
  googleRating: number | null;
  googleRatingCount: number | null;
  /** True when Google data is part of this object (UI must show a Google badge). */
  googleAttribution: boolean;
  reviewCount: number;
}

export interface ReviewItem {
  id: string;
  source: ReviewSource;
  author: string;
  authorUrl?: string | null;
  stars: number | null;
  text: string | null;
  placeId: number | null;
  placeName: string | null;
  createdAt: string;
  url?: string | null;
  /** Visible only to the author while pending/held. */
  ownPending?: boolean;
}

export interface FeedItem extends ReviewItem {
  emoji: string;
}

export interface FeedResponse {
  items: FeedItem[];
  threadsStatus: 'ok' | 'unavailable';
  now: string;
}

export interface PlaceDetail extends PlaceSummary {
  reviews: ReviewItem[];
  movedFrom: { id: number; name: string; address: string | null }[];
  movedTo: { id: number; name: string } | null;
  chainScore: number | null;
  chainSpots: number;
}

export interface LeaderboardRow {
  rank: number;
  id: number | string;
  name: string;
  value: number;
  /** For spots/chains/districts: the score; for tasters: rating count. */
  kind: LeaderboardKind;
  extra?: string;
}

export interface CityStats {
  city: string;
  spots: number;
  reviews: number;
  open: number;
  dead: number;
  lastSyncAt: string | null;
}

export interface NearItem extends PlaceSummary {
  distanceM: number;
  walkMin: number;
}

export interface NearResponse {
  radiusKm: 1 | 2 | 5;
  autoWidened: boolean;
  items: NearItem[];
}

export interface Me {
  id: number;
  nickname: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
  showRealName: boolean;
  hideFromLeaderboard: boolean;
  lang: Lang | null;
}

export interface LoginResponse {
  me: Me;
  needsNickname: boolean;
  suggestedNickname: string | null;
}

export interface ReviewSubmit {
  stars: 1 | 2 | 3 | 4 | 5;
  text?: string;
  nickname?: string;
  turnstileToken?: string;
}

export interface ReviewResult {
  id: number;
  status: 'published' | 'pending';
}

export interface RuntimeConfig {
  mapsBrowserKey: string | null;
  mapId: string | null;
  turnstileSiteKey: string | null;
  googleClientId: string | null;
  mapProvider: 'google' | 'maplibre';
}

export interface ApiErrorBody {
  error: { code: string; message: string; retryAfterSec?: number; [k: string]: unknown };
}
