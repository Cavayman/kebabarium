/**
 * Sync knobs (spec §8). Monthly caps sit under Google's per-SKU free monthly quotas
 * (Pro SKUs 5 000, Enterprise SKUs 1 000 free calls/month at the time of writing — re-check
 * https://developers.google.com/maps/billing-and-pricing/pricing before changing field masks).
 */
export const SYNC = {
  queries: ['шаурма', 'кебаб', 'doner', 'шаверма'],
  tileKm: 1.5,
  /** 6 text searches/hour ≈ 4 464/month. */
  tilesPerRun: 6,
  /** 1 details call/hour ≈ 744/month. */
  refreshPerRun: 1,
  deadNotSeenDays: 30,
  deadNoActivityDays: 180,
  /** Threads allows ~500 keyword searches per rolling 7 days: 2/hour = 336/week. */
  threadsPerRun: 2,
} as const;

export const CAPS: Record<string, number> = {
  'places.text_search_pro': 4500,
  'places.details_enterprise_atmosphere': 900,
  'threads.search': 1800,
};

export type SyncKind = 'discovery' | 'refresh' | 'threads' | 'all';
export const SYNC_KINDS: SyncKind[] = ['discovery', 'refresh', 'threads', 'all'];
