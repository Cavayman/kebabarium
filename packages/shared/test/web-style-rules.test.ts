// Guards the owner's visual rules across the web app's stylesheets (spec §5: no glow effects, flat buttons).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = join(__dirname, '../../../apps/web/src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(scss|css|html|ts)$/.test(f) && !f.endsWith('.spec.ts') ? [p] : [];
  });
}

/** A colour is "neutral" when it's black/white/grey (r = g = b) — the only colours allowed in shadows. */
function coloredShadows(src: string): string[] {
  const hits: string[] = [];
  for (const m of src.matchAll(/(box-shadow|text-shadow|drop-shadow)\s*[:(]([^;{}]*)/g)) {
    const value = m[2]!;
    for (const c of value.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(([^)]*)\)/gi)) {
      let rgb: number[];
      if (c[1]) {
        const h = c[1].length === 3 ? [...c[1]].map((x) => x + x).join('') : c[1];
        rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      } else {
        rgb = c[2]!.split(',').slice(0, 3).map((x) => parseFloat(x));
      }
      if (!(rgb[0] === rgb[1] && rgb[1] === rgb[2])) hits.push(`${m[1]}: ${value.trim()}`);
    }
  }
  return hits;
}

describe('web style rules', () => {
  it('detects coloured glows (self-check)', () => {
    expect(coloredShadows('.x { box-shadow: 0 0 18px #ff5a0066; }')).toHaveLength(1);
    expect(coloredShadows('.x { text-shadow: 0 0 10px rgba(255, 138, 31, 0.5); }')).toHaveLength(1);
    expect(coloredShadows('.x { box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); }')).toEqual([]);
  });

  it('uses only neutral (grey) colours in shadows — no glows', () => {
    const offenders = files(WEB).flatMap((f) => coloredShadows(readFileSync(f, 'utf8')).map((h) => `${f}: ${h}`));
    // The radar "you" dot halo is an accent ring, not a glow: allow exactly that one.
    expect(offenders.filter((o) => !o.includes('0 0 0 5px rgba(255, 122, 0, 0.2)'))).toEqual([]);
  });
});
