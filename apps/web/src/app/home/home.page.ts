import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor, type PlaceSummary } from '@kebabarium/shared';
import { ApiService } from '../core/api.service';
import { cityTitle, ConfigStore } from '../core/config.store';
import { MapComponent } from '../map/map.component';
import type { LngLat } from '../map/map-provider';
import { webglAvailable } from '../map/webgl';
import { DockComponent } from '../nav/dock.component';
import { NavbarComponent } from '../nav/navbar.component';
import { FeedPanel, type DropEvent } from '../panels/feed.panel';
import { LeaderboardPanel } from '../panels/leaderboard.panel';
import { LegendComponent } from '../panels/legend.component';
import { LayoutStore } from '../state/layout.store';
import { IconComponent } from '../ui/icon.component';

const PLACES_REFRESH_MS = 120_000;

@Component({
  selector: 'kb-home',
  imports: [MapComponent, NavbarComponent, LeaderboardPanel, FeedPanel, LegendComponent, DockComponent, IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  /** Route param `:city` (component input binding). */
  readonly city = input.required<string>();

  protected readonly cfg = inject(ConfigStore);
  protected readonly layout = inject(LayoutStore);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: 'uk' });
  readonly movedLabel = computed(() => {
    this.lang();
    return (name: string) => this.transloco.translate('map.moved', { name });
  });

  readonly map = viewChild(MapComponent);
  readonly places = signal<PlaceSummary[]>([]);
  readonly dimmed = signal<Set<number>>(new Set());
  readonly selectedId = signal<number | null>(null);
  readonly webgl = webglAvailable();
  readonly mapReady = signal(false);

  readonly currentCity = computed(() => this.cfg.cities().find((c) => c.slug === this.city()) ?? null);
  readonly title = computed(() => {
    const c = this.currentCity();
    return c ? cityTitle(c, this.lang()) : '';
  });
  readonly ranked = computed(() =>
    [...this.places()].filter((p) => p.status !== 'dead').sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
  );

  constructor() {
    void this.cfg.load().then(() => {
      if (!this.currentCity() && this.cfg.cities().length) void this.router.navigate(['/not-found'], { skipLocationChange: true });
    });
    effect((onCleanup) => {
      const slug = this.city();
      untracked(() => this.loadPlaces(slug));
      const t = setInterval(() => this.loadPlaces(slug), PLACES_REFRESH_MS);
      onCleanup(() => clearInterval(t));
    });
    inject(DestroyRef).onDestroy(() => this.selectedId.set(null));
  }

  loadPlaces(slug: string): void {
    this.api.places(slug).subscribe({ next: (p) => this.places.set(p), error: () => this.places.set([]) });
  }

  onMapReady(): void {
    this.mapReady.set(true);
    this.map()?.grow();
  }

  onPlaceClick(id: number): void {
    this.selectedId.set(id);
  }

  onMapClick(_c: LngLat): void {
    this.selectedId.set(null);
    this.layout.closeSheets();
  }

  onDrop(d: DropEvent): void {
    this.map()?.drop(d.placeId, d.stars, d.caption);
  }

  focusPlace(id: number): void {
    const p = this.places().find((x) => x.id === id);
    if (!p) return;
    this.selectedId.set(id);
    void this.map()?.flyTo(p, 15, 55);
  }

  openReview(): void {
    // wired in the review task
  }

  startNearby(): void {
    // wired in the nearby task
  }

  color(p: PlaceSummary): string {
    return ratingColor(p.score, p.status === 'dead');
  }
}
