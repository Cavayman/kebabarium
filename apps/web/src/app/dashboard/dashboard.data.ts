import type { PlaceSummary } from '@kebabarium/shared';

export interface HistogramBin {
  /** Lower edge (inclusive); the first bin is everything below 3.5. */
  from: number;
  to: number;
  label: string;
  count: number;
}

export interface DashboardData {
  /** Live (not dead/hidden) spots. */
  spots: number;
  scored: number;
  open: number;
  /** Every rating behind the scores: ours + Google's totals. */
  reviews: number;
  avg: number | null;
  top: PlaceSummary[];
  histogram: HistogramBin[];
  districts: { name: string; avg: number; count: number }[];
  discussed: PlaceSummary[];
  gems: PlaceSummary[];
  chains: { name: string; spots: number; avg: number | null }[];
}

const GEM_MIN_SCORE = 4.7;
const GEM_MAX_REVIEWS = 60;
const EDGES = [3.5, 3.75, 4, 4.25, 4.5, 4.75];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Everything the dashboard shows, computed from the city's places (same data as the map). */
export function buildDashboard(places: PlaceSummary[]): DashboardData {
  const live = places.filter((p) => p.status !== 'dead' && p.status !== 'hidden');
  const scored = live.filter((p) => p.score != null);

  const histogram: HistogramBin[] = [
    { from: 0, to: EDGES[0]!, label: `<${EDGES[0]}`, count: 0 },
    ...EDGES.map((from, i) => ({ from, to: EDGES[i + 1] ?? 5.01, label: String(from === 4 ? '4.0' : from), count: 0 })),
  ];
  for (const p of scored) histogram.find((b) => p.score! >= b.from && p.score! < b.to)!.count++;

  const group = (key: (p: PlaceSummary) => string | null) => {
    const m = new Map<string, PlaceSummary[]>();
    for (const p of live) {
      const k = key(p);
      if (k) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  };

  const districts = [...group((p) => p.district)]
    .map(([name, ps]) => ({ name, scores: ps.filter((p) => p.score != null).map((p) => p.score!) }))
    .filter((d) => d.scores.length > 0)
    .map((d) => ({ name: d.name, avg: r2(mean(d.scores)!), count: d.scores.length }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  const chains = [...group((p) => p.chainName)]
    .filter(([, ps]) => ps.length >= 2)
    .map(([name, ps]) => {
      const avg = mean(ps.filter((p) => p.score != null).map((p) => p.score!));
      return { name, spots: ps.length, avg: avg == null ? null : r2(avg) };
    })
    .sort((a, b) => b.spots - a.spots || (b.avg ?? 0) - (a.avg ?? 0));

  return {
    spots: live.length,
    scored: scored.length,
    open: live.filter((p) => p.status === 'open').length,
    reviews: live.reduce((a, p) => a + (p.reviewCount ?? 0), 0),
    avg: mean(scored.map((p) => p.score!)),
    top: scored.filter((p) => p.rank != null).sort((a, b) => a.rank! - b.rank!).slice(0, 10),
    histogram,
    districts,
    discussed: [...scored].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5),
    gems: scored
      .filter((p) => p.score! >= GEM_MIN_SCORE && p.reviewCount > 0 && p.reviewCount < GEM_MAX_REVIEWS)
      .sort((a, b) => b.score! - a.score! || b.reviewCount - a.reviewCount)
      .slice(0, 6),
    chains,
  };
}
