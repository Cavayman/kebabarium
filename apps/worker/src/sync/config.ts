/**
 * Sync knobs (spec §8). Monthly caps sit under Google's per-SKU free monthly quotas
 * (Text Search IDs Only: unlimited, Pro SKUs 5 000, Enterprise SKUs 1 000 free calls/month at the time of writing — re-check
 * https://developers.google.com/maps/billing-and-pricing/pricing before changing field masks).
 */
export const SYNC = {
  queries: ['шаурма', 'кебаб', 'doner', 'шаверма'],
  tileKm: 1.5,
  /** Google calls (ID searches + details of new places) per hourly run: ~20 × 744 ≈ 15 000 free ID searches/month, a full city pass about every day. */
  discoveryCallsPerRun: 20,
  /** Google calls per admin "scan now" request: Workers Free allows 50 outgoing fetches per invocation, keep a margin. */
  scanCallsPerRequest: 40,
  /** Google returns at most 3 pages (60 results) per search. */
  maxPagesPerSearch: 3,
  /** 1 details call/hour ≈ 744/month. */
  refreshPerRun: 1,
  deadNotSeenDays: 30,
  deadNoActivityDays: 180,
  /** Threads allows ~500 keyword searches per rolling 7 days: 2/hour = 336/week. */
  threadsPerRun: 2,
} as const;

export const CAPS: Record<string, number> = {
  /** Free without a cap; this only stops a runaway loop. */
  'places.text_search_ids': 30000,
  /** Name/location of newly found places: 5 000 free/month. */
  'places.details_pro': 4500,
  'places.details_enterprise_atmosphere': 900,
  'threads.search': 1800,
};

export type SyncKind = 'discovery' | 'refresh' | 'threads' | 'all';
export const SYNC_KINDS: SyncKind[] = ['discovery', 'refresh', 'threads', 'all'];
