import { describe, expect, it } from 'vitest';
import { columnHeight, NO_SCORE_HEIGHT, ratingColor, ratingStops, zoomFactor } from '../src/scale';

const hexToRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe('ratingColor', () => {
  it('hits the exact spec stops', () => {
    expect(ratingColor(1)).toBe('#e5484d');
    expect(ratingColor(3)).toBe('#f59e1b');
    expect(ratingColor(4.2)).toBe('#a6d13a');
    expect(ratingColor(5)).toBe('#22c77a');
  });
  it('clamps outside 1..4.9', () => {
    expect(ratingColor(0.2)).toBe('#e5484d');
    expect(ratingColor(4.95)).toBe('#22c77a');
  });
  it('interpolates between lime and green for 4.4', () => {
    const [r, g] = hexToRgb(ratingColor(4.4));
    expect(r).toBeLessThan(0xa6);
    expect(r).toBeGreaterThan(0x4f);
    expect(g).toBeGreaterThan(0xd1 - 1);
  });
  it('returns neutral grey for null and dark grey for dead', () => {
    expect(ratingColor(null)).toBe('#a1a1aa'); // light neutral: must stay visible on the dark map, unlike dead (#2e2e2e)
    expect(ratingColor(4.8, true)).toBe('#2e2e2e');
  });
  it('exposes the stops for gradients', () => {
    expect(ratingStops()[0]).toEqual([1, '#e5484d']);
    expect(ratingStops().at(-1)).toEqual([4.9, '#22c77a']);
  });
});

describe('columnHeight', () => {
  it('follows the stretched progressive scale', () => {
    expect(columnHeight(4.8, false)).toBeCloseTo(30 + Math.pow(0.9, 2.2) * 1100, 0);
    expect(columnHeight(2.1, false)).toBe(30);
    expect(columnHeight(3, false)).toBe(30);
    expect(columnHeight(4.8, true)).toBe(60);
    expect(columnHeight(null, false)).toBe(NO_SCORE_HEIGHT);
  });
  it('makes 4.8 clearly taller than 4.6', () => {
    expect(columnHeight(4.8, false) / columnHeight(4.6, false)).toBeGreaterThan(1.25);
  });
});

describe('zoomFactor', () => {
  it('scales down exponentially with zoom', () => {
    expect(zoomFactor(12)).toBe(1);
    expect(zoomFactor(11)).toBe(1);
    expect(zoomFactor(13.5)).toBeCloseTo(0.5, 2);
    expect(zoomFactor(16)).toBeCloseTo(0.12, 2);
    expect(zoomFactor(18)).toBeCloseTo(0.12, 2);
  });
});

describe('unscored columns', () => {
  it('stand clearly taller than the lowest rated stub so new places are visible on the map', () => {
    expect(NO_SCORE_HEIGHT).toBeGreaterThanOrEqual(3 * columnHeight(3, false));
    expect(NO_SCORE_HEIGHT).toBeLessThan(columnHeight(4, false));
  });
});
