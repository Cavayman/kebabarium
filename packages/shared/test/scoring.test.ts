import { describe, expect, it } from 'vitest';
import { combinedScore, ourScore, RANK, rankScore, ratingWord, round1 } from '../src/scoring';

describe('ourScore', () => {
  it('is the weighted mean', () => {
    expect(ourScore([{ stars: 5, weight: 1 }, { stars: 1, weight: 0.5 }])).toBeCloseTo(3.667, 3);
  });
  it('is null without ratings', () => {
    expect(ourScore([])).toBeNull();
  });
});

describe('combinedScore', () => {
  it('averages both sources', () => expect(combinedScore(4.9, 4.7)).toBe(4.8));
  it('falls back to the one that exists', () => {
    expect(combinedScore(null, 4.2)).toBe(4.2);
    expect(combinedScore(4.4, null)).toBe(4.4);
  });
  it('is null when nothing exists', () => expect(combinedScore(null, null)).toBeNull());
  it('never produces NaN', () => expect(combinedScore(Number.NaN, 4)).toBe(4));
});

describe('helpers', () => {
  it('rounds to one decimal', () => expect(round1(4.7667)).toBe(4.8));
  it('names stars in both languages', () => {
    expect(ratingWord(5, 'uk')).toBe('топ!');
    expect(ratingWord(1, 'uk')).toBe('погано');
    expect(ratingWord(3, 'en')).toBe('okay');
  });
});

describe('rankScore', () => {
  const now = new Date('2026-11-07T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400e3).toISOString();
  const prior = 4.3;

  it('puts a 4.7 from a thousand reviews above a 5.0 from three', () => {
    const many = rankScore(4.7, 1000, daysAgo(3), prior, now);
    const few = rankScore(5.0, 3, daysAgo(3), prior, now);
    expect(many).toBeGreaterThan(few);
    expect(many).toBeCloseTo((4.7 * 1000 + RANK.priorReviews * prior) / (1000 + RANK.priorReviews), 6);
  });

  it('moves towards the real rating as reviews pile up', () => {
    const r = (n: number) => rankScore(5.0, n, daysAgo(3), prior, now);
    expect(r(0)).toBeCloseTo(prior, 6);
    expect(r(10)).toBeLessThan(r(100));
    expect(r(100)).toBeLessThan(r(10000));
    expect(r(10000)).toBeLessThan(5.0);
  });

  it('ignores freshness while the last review is recent', () => {
    expect(rankScore(4.6, 200, daysAgo(1), prior, now)).toBe(rankScore(4.6, 200, daysAgo(RANK.freshDays), prior, now));
  });

  it('drops places whose last review is old, up to a fixed penalty', () => {
    const fresh = rankScore(4.6, 200, daysAgo(10), prior, now);
    const year = rankScore(4.6, 200, daysAgo(365), prior, now);
    const ancient = rankScore(4.6, 200, daysAgo(3000), prior, now);
    expect(year).toBeLessThan(fresh);
    expect(ancient).toBeLessThan(year);
    expect(fresh - ancient).toBeCloseTo(RANK.stalePenalty, 6);
  });

  it('treats a place with no dated review as stale', () => {
    expect(rankScore(4.6, 200, null, prior, now)).toBeCloseTo(rankScore(4.6, 200, daysAgo(3000), prior, now), 6);
  });
});
