import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ChatMessage,
  ChatResponse,
  City,
  CityStats,
  FeedResponse,
  LeaderboardKind,
  LeaderboardRow,
  LoginResponse,
  Me,
  NearResponse,
  PlaceDetail,
  PlaceSummary,
  ReviewItem,
  ReviewResult,
  ReviewSource,
  ReviewSubmit,
  RuntimeConfig,
} from '@kebabarium/shared';
import type { Observable } from 'rxjs';

export interface MyRatings {
  history: Array<ReviewItem & { status: string }>;
  top: Array<PlaceSummary & { myStars: number }>;
  count: number;
}

export interface MePatch {
  nickname?: string;
  showRealName?: boolean;
  hideFromLeaderboard?: boolean;
  lang?: 'uk' | 'en';
}

const params = (o: Record<string, string | number | undefined | null>) =>
  new HttpParams({ fromObject: Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '')) as Record<string, string> });

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  config(): Observable<RuntimeConfig> {
    return this.http.get<RuntimeConfig>('/api/config');
  }
  cities(): Observable<City[]> {
    return this.http.get<City[]>('/api/cities');
  }
  places(city: string): Observable<PlaceSummary[]> {
    return this.http.get<PlaceSummary[]>(`/api/cities/${city}/places`);
  }
  place(id: number, limit?: number): Observable<PlaceDetail> {
    return this.http.get<PlaceDetail>(`/api/places/${id}`, { params: params({ limit }) });
  }
  feed(city: string, q: { since?: string; source?: 'all' | ReviewSource; limit?: number } = {}): Observable<FeedResponse> {
    return this.http.get<FeedResponse>(`/api/cities/${city}/feed`, { params: params(q) });
  }
  chat(city: string, after?: number): Observable<ChatResponse> {
    return this.http.get<ChatResponse>(`/api/cities/${city}/chat`, { params: params({ after }) });
  }
  say(city: string, text: string): Observable<ChatMessage> {
    return this.http.post<ChatMessage>(`/api/cities/${city}/chat`, { text });
  }
  leaderboard(city: string, kind: LeaderboardKind): Observable<LeaderboardRow[]> {
    return this.http.get<LeaderboardRow[]>(`/api/cities/${city}/leaderboard`, { params: params({ kind }) });
  }
  stats(city: string): Observable<CityStats> {
    return this.http.get<CityStats>(`/api/cities/${city}/stats`);
  }
  near(lat: number, lng: number, r?: 1 | 2 | 5): Observable<NearResponse> {
    return this.http.get<NearResponse>('/api/places/near', { params: params({ lat, lng, r }) });
  }
  submitReview(placeId: number, body: ReviewSubmit): Observable<ReviewResult> {
    return this.http.post<ReviewResult>(`/api/places/${placeId}/reviews`, body);
  }
  editRating(placeId: number, body: { stars: number; text?: string }): Observable<ReviewResult> {
    return this.http.put<ReviewResult>(`/api/places/${placeId}/rating`, body);
  }
  deleteRating(placeId: number): Observable<void> {
    return this.http.delete<void>(`/api/places/${placeId}/rating`);
  }
  me(): Observable<Me | null> {
    return this.http.get<Me | null>('/api/me');
  }
  login(credential: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/google', { credential });
  }
  logout(): Observable<unknown> {
    return this.http.post('/api/auth/logout', {});
  }
  updateMe(patch: MePatch): Observable<Me> {
    return this.http.patch<Me>('/api/me', patch);
  }
  myRatings(): Observable<MyRatings> {
    return this.http.get<MyRatings>('/api/me/ratings');
  }

  // ---------- admin ----------
  admin = {
    overview: (city: string) => this.http.get<AdminOverview>('/api/admin/overview', { params: params({ city }) }),
    places: (q: { city?: string; status?: string; q?: string; deadCandidate?: 1; page?: number; sort?: AdminPlaceSort }) =>
      this.http.get<{ items: AdminPlace[]; total: number; page: number }>('/api/admin/places', { params: params(q) }),
    patchPlace: (id: number, patch: Partial<Pick<AdminPlace, 'name' | 'chainId' | 'logoUrl' | 'district' | 'status'>> & { deadCandidate?: boolean }) =>
      this.http.patch<AdminPlace>(`/api/admin/places/${id}`, patch),
    moveTo: (id: number, otherId: number) => this.http.post(`/api/admin/places/${id}/move-to/${otherId}`, {}),
    chains: (city = 'lviv') => this.http.get<AdminChain[]>('/api/admin/chains', { params: params({ city }) }),
    createChain: (b: { name: string; cityId?: number; logoUrl?: string | null }) => this.http.post<AdminChain>('/api/admin/chains', b),
    patchChain: (id: number, b: { name?: string; logoUrl?: string | null }) => this.http.patch<AdminChain>(`/api/admin/chains/${id}`, b),
    deleteChain: (id: number) => this.http.delete<void>(`/api/admin/chains/${id}`),
    reviews: (status: 'pending' | 'held', page = 1) =>
      this.http.get<{ items: AdminReview[]; page: number }>('/api/admin/reviews', { params: params({ status, page }) }),
    approve: (id: number) => this.http.post(`/api/admin/reviews/${id}/approve`, {}),
    hide: (id: number) => this.http.post(`/api/admin/reviews/${id}/hide`, {}),
    hideIdentity: (ratingId: number) => this.http.post<{ hidden: number }>('/api/admin/reviews/hide-identity', { ratingId }),
    bans: () => this.http.get<AdminBan[]>('/api/admin/bans'),
    ban: (b: { ratingId: number; kind: 'ip_prefix' | 'device' | 'user'; days: number | null; reason?: string }) =>
      this.http.post<AdminBan>('/api/admin/bans', b),
    unban: (id: number) => this.http.delete<void>(`/api/admin/bans/${id}`),
    sync: (kind: 'discovery' | 'refresh' | 'threads' | 'all') => this.http.post<{ runId: number }>('/api/admin/sync', { kind }),
    syncRuns: () => this.http.get<AdminSyncRun[]>('/api/admin/sync-runs'),
    chat: (city: string) => this.http.get<AdminChatMessage[]>('/api/admin/chat', { params: params({ city }) }),
    hideChat: (id: number) => this.http.delete<void>(`/api/admin/chat/${id}`),
    scan: (city: string) => this.http.post<AdminScanChunk>('/api/admin/scan', { city }),
    ratings: () =>
      this.http.post<{ runId: number; done: number; remaining: number; externalAdded: number; error: string | null; notes: string[] }>('/api/admin/ratings', {}),
    budget: () => this.http.get<{ month: string; usage: { sku: string; used: number; cap: number }[] }>('/api/admin/budget'),
  };
}

export interface AdminPlace {
  id: number;
  name: string;
  address: string | null;
  district: string | null;
  chainId: number | null;
  chainName: string | null;
  logoUrl: string | null;
  status: 'open' | 'closed_temp' | 'dead' | 'hidden';
  deadReason: string | null;
  deadCandidate: boolean;
  movedToPlaceId: number | null;
  googleRating: number | null;
  googleRatingCount: number | null;
  googlePlaceId: string | null;
  lastSeenAt: string | null;
  lat: number;
  lng: number;
}

export type AdminPlaceSort = 'name' | 'rating' | 'reviews' | 'newest' | 'seen';

export interface AdminChatMessage {
  id: number;
  author: string | null;
  userId: number;
  text: string;
  status: 'visible' | 'hidden';
  createdAt: string;
}

/** Per-city numbers for the admin overview (all counted server-side from the data). */
export interface AdminOverview {
  city: { slug: string; name: string };
  places: { total: number; open: number; closedTemp: number; dead: number; hidden: number; unrated: number; deadCandidates: number };
  reviews: { published: number; pending: number; held: number; google: number; threads: number };
  lastSyncAt: string | null;
  lastScanAt: string | null;
}

export interface AdminChain {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  cityId: number | null;
  spots?: number;
}

export interface AdminReview {
  id: number;
  placeId: number;
  placeName: string;
  stars: number;
  text: string | null;
  nickname: string | null;
  userId: number | null;
  userNickname: string | null;
  reasons: string[];
  createdAt: string;
  anonymous: boolean;
  identity: { network: string; ip: string; device: string };
}

export interface AdminBan {
  id: number;
  kind: string;
  value: string;
  reason: string | null;
  until: string | null;
  createdAt: string;
}

/** One chunk of a full city scan: `done` of `total` search pairs were finished by this request. */
export interface AdminScanChunk {
  runId: number;
  done: number;
  total: number;
  cursor: number;
  placesAdded: number;
  callsUsed: number;
  error: string | null;
  notes: string[];
}

export interface AdminSyncRun {
  id: number;
  kind: string;
  startedAt: string;
  finishedAt: string | null;
  callsUsed: number;
  placesAdded: number;
  placesUpdated: number;
  markedDead: number;
  externalAdded: number;
  threadsStatus: string | null;
  error: string | null;
  notes: string | null;
}
