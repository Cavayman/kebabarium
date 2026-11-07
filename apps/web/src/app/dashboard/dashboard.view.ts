import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor, type CityStats, type FeedItem, type PlaceSummary } from '@kebabarium/shared';
import { ApiService } from '../core/api.service';
import { formatCount, reviewsText } from '../ui/count';
import { IconComponent } from '../ui/icon.component';
import { asTimeLang, reviewTime } from '../ui/time';
import { buildDashboard, type HistogramBin } from './dashboard.data';

/** Dot-plot axis for district averages: below 3.5 is pinned to the left edge. */
const AXIS_MIN = 3.5;
const AXIS_MAX = 5;

/** The city as numbers and lists, for people who'd rather read than fly the 3D map. Same data as the map. */
@Component({
  selector: 'kb-dashboard',
  imports: [IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.view.html',
  styleUrl: './dashboard.view.scss',
})
export class DashboardView {
  readonly city = input.required<string>();
  readonly cityName = input.required<string>();
  readonly places = input<PlaceSummary[]>([]);
  readonly stats = input<CityStats | null>(null);
  readonly pick = output<number>();

  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  readonly data = computed(() => buildDashboard(this.places()));
  readonly fresh = signal<FeedItem[]>([]);
  readonly histMax = computed(() => Math.max(1, ...this.data().histogram.map((b) => b.count)));
  readonly discussedMax = computed(() => Math.max(1, ...this.data().discussed.map((p) => p.reviewCount)));

  constructor() {
    effect((onCleanup) => {
      const sub = this.api.feed(this.city(), { limit: 6 }).subscribe({ next: (r) => this.fresh.set(r.items), error: () => this.fresh.set([]) });
      onCleanup(() => sub.unsubscribe());
    });
  }

  color(v: number | null): string {
    return ratingColor(v);
  }
  count(n: number): string {
    return formatCount(this.t, n);
  }
  reviews(n: number): string {
    return reviewsText(this.t, n);
  }
  when(iso: string | null): string {
    return iso ? reviewTime(iso, asTimeLang(this.t.getActiveLang())).short : '—';
  }
  stars(n: number | null): string {
    return n ? '★'.repeat(n) : '';
  }

  /** Bars are coloured by the score band they stand for, like the columns on the map. */
  binColor(b: HistogramBin): string {
    return ratingColor(b.from === 0 ? 3 : Math.min(5, (b.from + b.to) / 2));
  }
  binPct(b: HistogramBin): number {
    return b.count ? Math.max(4, (b.count / this.histMax()) * 100) : 0;
  }
  binTitle(b: HistogramBin): string {
    return this.t.translate('dash.histBar', { label: b.label, n: b.count });
  }
  dotPct(avg: number): number {
    return Math.min(100, Math.max(0, ((avg - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * 100));
  }
  barPct(n: number): number {
    return Math.max(2, (n / this.discussedMax()) * 100);
  }
}
