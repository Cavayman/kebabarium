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
import { ToastService } from '../ui/toast';
import { AuthStore } from '../auth/auth.store';
import { PlaceCardComponent } from '../place/place-card.component';
import { ReviewModalComponent } from '../review/review-modal.component';
import { NearbyPanel } from '../nearby/nearby.panel';
import { AccountComponent } from '../auth/account.component';
import { BootScreenComponent } from '../boot/boot-screen.component';
import { BootState } from '../boot/boot.state';
import type { CityStats } from '@kebabarium/shared';
import { NearbyService } from '../nearby/nearby.service';

const PLACES_REFRESH_MS = 120_000;

@Component({
  selector: 'kb-home',
  imports: [MapComponent, NavbarComponent, LeaderboardPanel, FeedPanel, LegendComponent, DockComponent, IconComponent, PlaceCardComponent, ReviewModalComponent, NearbyPanel, AccountComponent, BootScreenComponent, TranslocoDirective],
  providers: [NearbyService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  /** Route param `:city` (component input binding). */
  readonly city = input.required<string>();

  protected readonly cfg = inject(ConfigStore);
  protected readonly layout = inject(LayoutStore);
  protected readonly auth = inject(AuthStore);
  protected readonly nearby = inject(NearbyService);
  protected readonly boot = inject(BootState);
  readonly stats = signal<CityStats | null>(null);
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
    [...this.places()].filter((p) => p.status !== 'dead').sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.score ?? -1) - (a.score ?? -1)),
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
    this.nearby.attach({
      flyTo: (c, zoom, pitch) => this.map()?.flyTo(c, zoom, pitch) ?? Promise.resolve(),
      radar: () => this.map()?.radar ?? null,
      setLit: (ids) => {
        this.dimmed.set(ids ? new Set(this.places().filter((p) => !ids.has(p.id)).map((p) => p.id)) : new Set());
        if (ids) this.layout.open('near');
      },
    });
    inject(DestroyRef).onDestroy(() => this.nearby.close());
  }

  private statsLoaded = false;
  loadPlaces(slug: string): void {
    if (!this.statsLoaded) {
      this.statsLoaded = true;
      this.api.stats(slug).subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
    }
    this.api.places(slug).subscribe({ next: (p) => this.places.set(p), error: () => this.places.set([]) });
  }

  onMapReady(): void {
    this.mapReady.set(true);
    if (this.boot.shown()) this.map()?.grow();
  }

  onBootDone(): void {
    this.boot.shown.set(true);
    if (this.mapReady()) this.map()?.grow();
  }

  onPlaceClick(id: number): void {
    this.selectedId.set(id);
    this.anchorCard();
  }

  onMapClick(c: LngLat): void {
    if (this.nearby.mapClicked(c)) return;
    this.selectedId.set(null);
    this.layout.closeSheets();
  }

  /** Desktop: the card floats next to its column top and follows the camera. */
  readonly cardPos = signal<{ x: number; y: number } | null>(null);
  anchorCard(): void {
    const id = this.selectedId();
    const p = id == null ? null : this.places().find((x) => x.id === id);
    const m = this.map();
    const xy = p && m ? m.project(p) : null;
    if (!p || !m || !xy) return this.cardPos.set(null);
    const top = xy.y - m.columnTopPx(p);
    const w = 300;
    const x = Math.min(Math.max(12, xy.x + 18), innerWidth - w - 12);
    const y = Math.min(Math.max(70, top - 60), innerHeight - 440);
    this.cardPos.set({ x, y });
  }

  // ---------- reviews ----------
  readonly reviewFor = signal<number | null | undefined>(undefined); // undefined = closed, null = no preselection
  private readonly toast = inject(ToastService);

  onReviewed(r: { status: 'published' | 'pending'; placeId: number }): void {
    this.toast.show(
      this.transloco.translate('review.sent', {
        status: this.transloco.translate(r.status === 'published' ? 'review.statusPublished' : 'review.statusPending'),
      }),
    );
    this.loadPlaces(this.city());
    if (r.status === 'published') {
      const me = this.auth.me();
      this.map()?.drop(r.placeId, null, me ? me.displayName : '✨');
    }
  }

  onDrop(d: DropEvent): void {
    this.map()?.drop(d.placeId, d.stars, d.caption);
  }

  focusPlace(id: number): void {
    const p = this.places().find((x) => x.id === id);
    if (!p) return;
    this.selectedId.set(id);
    void this.map()?.flyTo(p, 15, 55).then(() => this.anchorCard());
  }

  openReview(placeId: number | null = null): void {
    this.reviewFor.set(placeId);
  }

  startNearby(): void {
    this.selectedId.set(null);
    if (this.layout.mobile()) this.layout.closeSheets();
    void this.nearby.start();
  }

  closeNearby(): void {
    this.nearby.close();
    this.layout.collapse('near');
  }

  color(p: PlaceSummary): string {
    return ratingColor(p.score, p.status === 'dead');
  }
}
