import { describe, expect, it } from 'vitest';
import { combinedScore, ourScore, ratingWord, round1 } from '../src/scoring';

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
