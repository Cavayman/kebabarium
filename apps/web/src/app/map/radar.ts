import type { LngLat, MapProvider } from './map-provider';

/**
 * Nearby radar: orange disc of the search radius, rotating sweep, expanding rings and a "you" dot.
 * HTML overlay that re-measures on every camera move, so it always matches the real radius.
 */
export class Radar {
  private root: HTMLElement | null = null;
  private center: LngLat | null = null;
  private km = 1;
  private off?: () => void;

  constructor(
    private readonly map: MapProvider,
    private readonly host: HTMLElement,
  ) {}

  show(center: LngLat, km: number): void {
    this.hide();
    this.center = center;
    this.km = km;
    const root = document.createElement('div');
    root.className = 'radar';
    root.innerHTML = `<div class="radar-plane">
        <div class="radar-disc radar-area"></div>
        <div class="radar-disc radar-sweep"></div>
        <div class="radar-disc radar-ring"></div><div class="radar-disc radar-ring r2"></div><div class="radar-disc radar-ring r3"></div>
      </div><div class="radar-me"></div>`;
    this.host.appendChild(root);
    this.root = root;
    this.off = this.map.onMove(() => this.layout());
    this.layout();
  }

  setRadius(km: number): void {
    this.km = km;
    this.root?.classList.remove('done');
    this.layout();
  }

  finish(): void {
    this.root?.classList.add('done');
  }

  hide(): void {
    this.off?.();
    this.off = undefined;
    this.root?.remove();
    this.root = null;
  }

  private layout(): void {
    if (!this.root || !this.center) return;
    const { x, y } = this.map.project(this.center);
    const d = Math.round(2 * this.map.metersToPixels(this.km * 1000, this.center));
    this.root.style.transform = `translate(${x}px, ${y}px)`;
    const plane = this.root.querySelector<HTMLElement>('.radar-plane')!;
    plane.style.transform = `perspective(900px) rotateX(${this.map.pitch()}deg)`;
    this.root.querySelectorAll<HTMLElement>('.radar-disc').forEach((el) => {
      if (!el.classList.contains('radar-ring')) {
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
      }
      el.style.setProperty('--d', `${d}px`);
    });
  }
}
