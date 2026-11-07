import type { PlaceSummary } from '@kebabarium/shared';
import { buildDashboard } from './dashboard.data';

const place = (id: number, extra: Partial<PlaceSummary> = {}): PlaceSummary => ({
  id, name: `P${id}`, lat: 49.83, lng: 24.02, district: null, address: null, status: 'open', deadReason: null, movedToPlaceId: null,
  chainId: null, chainName: null, logoUrl: null, score: null, ourScore: null, ourCount: 0, googleRating: null, googleRatingCount: null,
  googleAttribution: false, reviewCount: 0, rank: null, ...extra,
});

const places = [
  place(1, { score: 4.8, reviewCount: 2000, rank: 1, district: 'Галицький', chainId: 1, chainName: 'Мангал' }),
  place(2, { score: 4.6, reviewCount: 800, rank: 2, district: 'Галицький', chainId: 1, chainName: 'Мангал' }),
  place(3, { score: 5.0, reviewCount: 12, rank: 3, district: 'Сихівський' }),
  place(4, { score: 3.2, reviewCount: 40, rank: 5, district: 'Сихівський' }),
  place(5, { score: 4.9, reviewCount: 30, rank: 4, district: 'Франківський' }),
  place(6, { score: null, reviewCount: 0, district: 'Франківський' }),
  place(7, { score: 4.9, reviewCount: 5000, status: 'dead', rank: null }),
  place(8, { score: 4.0, reviewCount: 100, status: 'closed_temp', rank: 6, district: 'Франківський' }),
];

describe('buildDashboard', () => {
  const d = buildDashboard(places);

  it('counts the city: live spots, scored ones, open ones and every rating behind them', () => {
    expect(d).toMatchObject({ spots: 7, scored: 6, open: 6, reviews: 2000 + 800 + 12 + 40 + 30 + 100 });
  });

  it('averages the scores of live spots', () => {
    expect(d.avg).toBeCloseTo((4.8 + 4.6 + 5.0 + 3.2 + 4.9 + 4.0) / 6, 6);
  });

  it('lists the top in ranking order, never dead or unscored places', () => {
    expect(d.top.map((p) => p.id)).toEqual([1, 2, 3, 5, 4, 8]);
  });

  it('bins scores into a histogram that covers every scored live spot', () => {
    expect(d.histogram.map((b) => b.label)).toEqual(['<3.5', '3.5', '3.75', '4.0', '4.25', '4.5', '4.75']);
    expect(d.histogram.map((b) => b.count)).toEqual([1, 0, 0, 1, 0, 1, 3]);
    expect(d.histogram.reduce((a, b) => a + b.count, 0)).toBe(d.scored);
  });

  it('ranks districts by average score and keeps how many spots stand behind each', () => {
    expect(d.districts).toEqual([
      { name: 'Галицький', avg: 4.7, count: 2 },
      { name: 'Франківський', avg: 4.45, count: 2 },
      { name: 'Сихівський', avg: 4.1, count: 2 },
    ]);
  });

  it('finds the most discussed spots and the hidden gems (great score, few reviews)', () => {
    expect(d.discussed.map((p) => p.id)).toEqual([1, 2, 8, 4, 5]);
    expect(d.gems.map((p) => p.id)).toEqual([3, 5]);
  });

  it('groups chains with their spot count and average', () => {
    expect(d.chains).toEqual([{ name: 'Мангал', spots: 2, avg: 4.7 }]);
  });

  it('copes with a city that has no places yet', () => {
    expect(buildDashboard([])).toMatchObject({ spots: 0, scored: 0, avg: null, top: [], districts: [], gems: [], chains: [] });
  });
});
