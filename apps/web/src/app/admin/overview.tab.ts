import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { City } from '@kebabarium/shared';
import { ApiService, type AdminOverview } from '../core/api.service';
import { formatCount } from '../ui/count';
import { asTimeLang, reviewTime } from '../ui/time';
import { AdminJobsComponent } from './jobs.component';

export type AdminTab = 'overview' | 'places' | 'chains' | 'moderation' | 'sync';

/** First admin screen: the selected city in numbers, what needs attention, and the scan/rating jobs. */
@Component({
  selector: 'kb-admin-overview',
  imports: [TranslocoDirective, AdminJobsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      @if (data(); as d) {
        <p class="muted when">
          {{ t('admin.lastSync') }}: <b>{{ when(d.lastSyncAt) }}</b> · {{ t('admin.lastScan') }}: <b>{{ when(d.lastScanAt) }}</b>
        </p>

        <h3>{{ t('admin.places') }}</h3>
        <div class="tiles">
          @for (k of placeKeys; track k) {
            <div class="tile" [class.warn]="(k === 'unrated' || k === 'deadCandidates') && d.places[k] > 0">
              <b [attr.data-n]="k">{{ n(d.places[k]) }}</b><span>{{ t('admin.n.' + k) }}</span>
            </div>
          }
        </div>

        <h3>{{ t('admin.reviewsTitle') }}</h3>
        <div class="tiles">
          @for (k of reviewKeys; track k) {
            <div class="tile" [class.warn]="(k === 'held' || k === 'pending') && d.reviews[k] > 0">
              <b [attr.data-n]="k">{{ n(d.reviews[k]) }}</b><span>{{ t('admin.n.' + k) }}</span>
            </div>
          }
        </div>

        <h3>{{ t('admin.attention') }}</h3>
        <ul class="todo">
          @if (d.reviews.held + d.reviews.pending > 0) {
            <li><span>{{ t('admin.todoModeration', { n: d.reviews.held + d.reviews.pending }) }}</span><button type="button" class="chip sm" data-go="moderation" (click)="open.emit('moderation')">{{ t('admin.moderation') }} →</button></li>
          }
          @if (d.places.deadCandidates > 0) {
            <li><span>{{ t('admin.todoCandidates', { n: d.places.deadCandidates }) }}</span><button type="button" class="chip sm" data-go="places" (click)="open.emit('places')">{{ t('admin.places') }} →</button></li>
          }
          @if (d.places.unrated > 0) {
            <li><span>{{ t('admin.todoUnrated', { n: d.places.unrated }) }}</span></li>
          }
          @if (d.reviews.held + d.reviews.pending === 0 && d.places.deadCandidates === 0 && d.places.unrated === 0) {
            <li class="muted">{{ t('admin.allGood') }}</li>
          }
        </ul>
      }
      <kb-admin-jobs [city]="city()" (finished)="load()" />
    </ng-container>
  `,
  styleUrl: './admin.scss',
  styles: `
    h3 { font-family: var(--font-display); font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: var(--dim); }
    .when { margin: 0; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
    .tile { padding: 10px 12px; border-radius: 14px; background: rgba(255,255,255,.04); border: 1px solid var(--edge); display: flex; flex-direction: column; gap: 2px; }
    .tile b { font-family: var(--font-display); font-size: 20px; font-variant-numeric: tabular-nums; }
    .tile span { font-size: 11.5px; color: var(--dim); }
    .tile.warn { border-color: color-mix(in srgb, var(--acc2) 60%, transparent); }
    .tile.warn b { color: var(--acc2); }
    .todo { list-style: none; margin: 0 0 12px; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .todo li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,.04); font-size: 13px; }
  `,
})
export class OverviewTab {
  readonly city = input.required<City>();
  readonly open = output<AdminTab>();
  readonly data = signal<AdminOverview | null>(null);
  readonly placeKeys = ['total', 'open', 'closedTemp', 'dead', 'hidden', 'unrated', 'deadCandidates'] as const;
  readonly reviewKeys = ['published', 'pending', 'held', 'google', 'threads'] as const;
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);

  constructor() {
    effect(() => {
      this.city();
      this.load();
    });
  }

  load(): void {
    this.api.admin.overview(this.city().slug).subscribe((d) => this.data.set(d));
  }
  n(v: number): string {
    return formatCount(this.t, v);
  }
  when(iso: string | null): string {
    return iso ? reviewTime(iso, asTimeLang(this.t.getActiveLang())).short : '—';
  }
}
