import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  PendingTasks,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import type { City, PlaceSummary, RuntimeConfig } from '@kebabarium/shared';
import { dropEmoji } from './emoji-drop';
import { MAP_PROVIDER_FACTORY, type LngLat, type MapProvider } from './map-provider';
import { Radar } from './radar';

interface Label {
  id: number;
  text: string;
  score: string | null;
  x: number;
  y: number;
  dead: boolean;
}

@Component({
  selector: 'kb-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent {
  readonly city = input.required<City>();
  readonly places = input<PlaceSummary[]>([]);
  readonly dimmed = input<Set<number>>(new Set());
  readonly providerKind = input<RuntimeConfig['mapProvider']>('google');
  readonly config = input<RuntimeConfig | null>(null);
  /** Text used for a dead place that moved: receives the target name. */
  readonly movedLabel = input<(name: string) => string>((n) => `→ ${n}`);

  readonly placeClick = output<number>();
  readonly mapClick = output<LngLat>();
  readonly ready = output<void>();
  /** Camera moved (rAF-throttled) — lets the page re-anchor HTML (place card) to the map. */
  readonly moved = output<void>();

  readonly labels = signal<Label[]>([]);
  readonly failed = signal(false);

  private readonly mapEl = viewChild.required<ElementRef<HTMLElement>>('mapEl');
  private readonly overlayEl = viewChild.required<ElementRef<HTMLElement>>('overlay');
  private readonly factory = inject(MAP_PROVIDER_FACTORY);
  private readonly pending = inject(PendingTasks);
  private provider: MapProvider | null = null;
  private readonly providerReady = signal(false);
  private cityId: number | null = null;
  private frame = 0;
  private offMove?: () => void;
  radar: Radar | null = null;

  constructor() {
    afterNextRender(() => {
      void this.pending.run(() => this.init());
    });
    effect(() => {
      const places = this.places();
      const dimmedIds = this.dimmed();
      if (!this.providerReady()) return;
      untracked(() => {
        this.provider!.setPlaces(places, { dimmedIds });
        this.refreshLabels();
      });
    });
    effect(() => {
      const c = this.city();
      if (!this.providerReady() || c.id === this.cityId) return;
      this.cityId = c.id;
      void untracked(() => this.provider!.flyTo(c.center, c.zoom, 58));
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.offMove?.();
      this.radar?.hide();
      this.provider?.destroy();
    });
  }

  private async init(): Promise<void> {
    try {
      const p = await this.factory(this.providerKind(), this.config());
      await p.init(this.mapEl().nativeElement, this.city());
      this.provider = p;
      this.cityId = this.city().id;
      p.onPlaceClick((id) => this.placeClick.emit(id));
      p.onMapClick((c) => this.mapClick.emit(c));
      this.offMove = p.onMove(() => this.scheduleLabels());
      this.radar = new Radar(p, this.overlayEl().nativeElement);
      this.providerReady.set(true);
      p.setPlaces(this.places(), { dimmedIds: this.dimmed() });
      this.refreshLabels();
      this.ready.emit();
    } catch (e) {
      console.error('map init failed', e);
      this.failed.set(true);
    }
  }

  /** Grows the columns (called when the boot screen fades out). */
  grow(): void {
    this.provider?.growColumns();
  }

  flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void> {
    return this.provider ? this.provider.flyTo(c, zoom, pitch) : Promise.resolve();
  }

  /** Plays the review-drop animation over a place's column. */
  drop(placeId: number, stars: number | null, caption: string): void {
    const p = this.places().find((x) => x.id === placeId);
    if (!p || !this.provider) return;
    dropEmoji(this.provider, this.overlayEl().nativeElement, { lat: p.lat, lng: p.lng, heightPx: this.provider.columnHeightPx(p) }, stars, caption);
  }

  project(c: LngLat): { x: number; y: number } | null {
    return this.provider?.project(c) ?? null;
  }

  columnTopPx(p: PlaceSummary): number {
    return this.provider?.columnHeightPx(p) ?? 0;
  }

  private scheduleLabels(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.refreshLabels();
      this.moved.emit();
    });
  }

  /** Pills over the top three spots and over dead spots that moved. */
  refreshLabels(): void {
    const p = this.provider;
    if (!p) return;
    const all = this.places();
    const top = all
      .filter((x) => x.status !== 'dead' && x.score != null)
      .sort((a, b) => b.score! - a.score!)
      .slice(0, 3);
    const moved = all.filter((x) => x.status === 'dead' && x.movedToPlaceId != null);
    const label = (x: PlaceSummary, dead: boolean): Label => {
      const { x: px, y } = p.project(x);
      const target = dead ? all.find((t) => t.id === x.movedToPlaceId)?.name ?? '' : '';
      return {
        id: x.id,
        text: dead ? this.movedLabel()(target) : x.name,
        score: dead ? null : x.score!.toFixed(1),
        x: px,
        y: y - p.columnHeightPx(x),
        dead,
      };
    };
    this.labels.set([...top.map((x) => label(x, false)), ...moved.map((x) => label(x, true))]);
  }
}
