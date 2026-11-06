/** Traffic-light rating scale (spec §5): 1 red → 3 orange → 5 green. */
const STOPS: ReadonlyArray<readonly [number, string]> = [
  [1, '#e5484d'],
  [2.2, '#ef6a3c'],
  [3, '#f59e1b'],
  [3.7, '#e3c12a'],
  [4.2, '#a6d13a'],
  [4.6, '#4fd46b'],
  [4.9, '#22c77a'],
];
export const DEAD_COLOR = '#2e2e2e';
export const NO_SCORE_COLOR = '#a1a1aa';

export function ratingStops(): Array<[number, string]> {
  return STOPS.map(([v, c]) => [v, c]);
}

const toRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

export function ratingColor(r: number | null, dead = false): string {
  if (dead) return DEAD_COLOR;
  if (r == null || Number.isNaN(r)) return NO_SCORE_COLOR;
  const first = STOPS[0]!;
  const last = STOPS[STOPS.length - 1]!;
  if (r <= first[0]) return first[1];
  if (r >= last[0]) return last[1];
  for (let i = 1; i < STOPS.length; i++) {
    const [v1, c1] = STOPS[i]!;
    const [v0, c0] = STOPS[i - 1]!;
    if (r <= v1) {
      const t = (r - v0) / (v1 - v0);
      const a = toRgb(c0);
      const b = toRgb(c1);
      return toHex(a.map((x, k) => x + (b[k]! - x) * t));
    }
  }
  return last[1];
}

/** Unscored (freshly discovered) places: a grey column tall enough to see on the map, still below a 4.0. */
export const NO_SCORE_HEIGHT = 120;

/** Column height in metres (before zoom scaling). */
export function columnHeight(r: number | null, dead: boolean): number {
  if (dead) return 60;
  if (r == null || Number.isNaN(r)) return NO_SCORE_HEIGHT;
  if (r < 3) return 30;
  return 30 + Math.pow((r - 3) / 2, 2.2) * 1100;
}

/** Zoom stops for column heights; same curve as MapLibre `['interpolate', ['exponential', 2], ['zoom'], ...]`. */
export const ZOOM_STOPS: ReadonlyArray<readonly [number, number]> = [
  [12, 1],
  [13.5, 0.5],
  [16, 0.12],
];

export function zoomFactor(zoom: number): number {
  const first = ZOOM_STOPS[0]!;
  const last = ZOOM_STOPS[ZOOM_STOPS.length - 1]!;
  if (zoom <= first[0]) return first[1];
  if (zoom >= last[0]) return last[1];
  for (let i = 1; i < ZOOM_STOPS.length; i++) {
    const [z1, v1] = ZOOM_STOPS[i]!;
    const [z0, v0] = ZOOM_STOPS[i - 1]!;
    if (zoom <= z1) {
      const t = (Math.pow(2, zoom - z0) - 1) / (Math.pow(2, z1 - z0) - 1);
      return v0 + (v1 - v0) * t;
    }
  }
  return last[1];
}
