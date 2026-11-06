import type { CityStats } from '@kebabarium/shared';

/** Terminal boot screen (spec §5 Loading screen). Pure and time-driven so it runs at the same speed on slow devices. */
export const BOOT_HARD_MAX_MS = 7000;
export const SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
const GAP = 60;

type Value = (s: CityStats | null) => string;

export interface BootStep {
  kind: 'cmd' | 'step' | 'bar' | 'ready';
  /** start (ms) and duration (ms) on the boot clock */
  t: number;
  d: number;
  text: string;
  value?: Value;
}

export interface BootLine {
  kind: BootStep['kind'];
  text: string;
  value?: string;
  spinning?: boolean;
  percent?: number;
  caret?: boolean;
}

const fmt = (n: number) => n.toLocaleString('uk-UA').replace(/ /g, ' ');
const dash = (s: CityStats | null, f: (s: CityStats) => string) => (s ? f(s) : '…');

export function bootTimeline(citySlug: string, readyText: string): BootStep[] {
  const raw: Array<Omit<BootStep, 't'>> = [
    { kind: 'cmd', text: `kebabarium --city ${citySlug} --hungry`, d: 700 },
    { kind: 'step', text: 'locating city', d: 300, value: (s) => dash(s, (x) => x.city) },
    { kind: 'step', text: 'searching shawarma', d: 420, value: (s) => dash(s, (x) => `${fmt(x.spots)} spots`) },
    { kind: 'step', text: 'validating reviews', d: 380, value: (s) => dash(s, (x) => fmt(x.reviews)) },
    { kind: 'step', text: "checking who's still open", d: 360, value: (s) => dash(s, (x) => `${fmt(x.open)} open · ${fmt(x.dead)} dead`) },
    { kind: 'step', text: 'heating up the grill', d: 300, value: () => '230°C' },
    { kind: 'bar', text: 'preparing map', d: 700 },
    { kind: 'ready', text: readyText, d: 500 },
  ];
  let t = 0;
  return raw.map((s) => {
    const step = { ...s, t };
    t += s.d + GAP;
    return step;
  });
}

export const bootEnd = (steps: BootStep[]) => {
  const last = steps[steps.length - 1]!;
  return last.t + last.d;
};

/** Where the clock waits for the map: 70 % of the progress bar. */
export const holdPoint = (steps: BootStep[]) => {
  const bar = steps.find((s) => s.kind === 'bar')!;
  return bar.t + bar.d * 0.7;
};

export function bootFrame(steps: BootStep[], clock: number, stats: CityStats | null): { lines: BootLine[]; finished: boolean } {
  const lines: BootLine[] = [];
  for (const s of steps) {
    const local = clock - s.t;
    if (local < 0) break;
    const p = Math.min(1, local / s.d);
    switch (s.kind) {
      case 'cmd':
        lines.push({ kind: 'cmd', text: s.text.slice(0, Math.max(1, Math.ceil(s.text.length * Math.min(1, p * 1.15)))), caret: p < 1 });
        break;
      case 'step':
        lines.push({
          kind: 'step',
          text: s.text.slice(0, Math.ceil(s.text.length * Math.min(1, p * 3))),
          spinning: p < 1,
          value: p < 1 ? SPINNER[Math.floor(clock / 70) % SPINNER.length] : s.value!(stats),
        });
        break;
      case 'bar':
        lines.push({ kind: 'bar', text: s.text, percent: Math.round(p * 100) });
        break;
      case 'ready':
        lines.push({ kind: 'ready', text: s.text, caret: true });
        break;
    }
  }
  return { lines, finished: clock >= bootEnd(steps) };
}
