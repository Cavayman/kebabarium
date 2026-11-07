import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import type { City } from '@kebabarium/shared';
import { AdminJobs } from './admin-jobs.service';

/** "Scan the whole city" and "pull Google ratings" buttons with live progress. */
@Component({
  selector: 'kb-admin-jobs',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <div class="job">
        <button type="button" class="chip sm acc" data-scan (click)="scan()" [disabled]="jobs.scanning()">{{ t('admin.scanCity', { city: city().name }) }}</button>
        @if (jobs.scanTotal()) {
          <div class="bar"><i [style.width.%]="pct(jobs.scanDone(), jobs.scanTotal())"></i></div>
          <span class="muted">{{ jobs.scanDone() }} / {{ jobs.scanTotal() }} · +{{ jobs.scanAdded() }} {{ t('admin.scanNew') }}</span>
        }
        @if (jobs.scanError(); as err) {
          <span class="danger">{{ err }}</span>
        }
      </div>
      <div class="job">
        <button type="button" class="chip sm" data-ratings (click)="ratings()" [disabled]="jobs.rating()">{{ t('admin.pullRatings') }}</button>
        @if (jobs.ratingTotal()) {
          <div class="bar"><i [style.width.%]="pct(jobs.ratingDone(), jobs.ratingTotal())"></i></div>
          <span class="muted" data-ratings-progress>{{ jobs.ratingDone() }} / {{ jobs.ratingTotal() }}</span>
        }
        @if (jobs.ratingError(); as err) {
          <span class="danger">{{ err }}</span>
        }
      </div>
    </ng-container>
  `,
  styleUrl: './admin.scss',
  styles: `
    .job { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; font-size: 12px; margin: 8px 0; }
    .job .danger { grid-column: 1 / -1; }
    .bar { height: 8px; border-radius: 4px; background: var(--hover); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--ok); transition: width .3s; }
  `,
})
export class AdminJobsComponent {
  readonly city = input.required<City>();
  /** Emitted after a job ends, so the host can reload its numbers. */
  readonly finished = output<void>();
  readonly jobs = inject(AdminJobs);

  pct(done: number, total: number): number {
    return total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  }
  async scan(): Promise<void> {
    await this.jobs.scanAll(this.city().slug);
    this.finished.emit();
  }
  async ratings(): Promise<void> {
    await this.jobs.pullRatings();
    this.finished.emit();
  }
}
