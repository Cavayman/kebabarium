import { ratingEmoji } from '@kebabarium/shared';
import type { LngLat, MapProvider } from './map-provider';

const LIFETIME_MS = 2800;

/** The review-drop animation: emoji falls into the column top with a ring burst and a short caption pill. */
export function dropEmoji(
  map: MapProvider,
  host: HTMLElement,
  at: LngLat & { heightPx: number },
  stars: number | null,
  caption: string,
): void {
  const el = document.createElement('div');
  el.className = 'drop';
  const emoji = document.createElement('span');
  emoji.className = 'e';
  emoji.textContent = ratingEmoji(stars);
  const cap = document.createElement('span');
  cap.className = 'cap';
  cap.textContent = caption; // text only — captions contain user nicknames
  const ring = document.createElement('span');
  ring.className = 'ring';
  el.append(emoji, cap, ring);
  host.appendChild(el);

  const place = () => {
    const { x, y } = map.project(at);
    el.style.transform = `translate(${x}px, ${y - at.heightPx}px)`;
  };
  place();
  const off = map.onMove(place);
  setTimeout(() => {
    off();
    el.remove();
  }, LIFETIME_MS);
}
