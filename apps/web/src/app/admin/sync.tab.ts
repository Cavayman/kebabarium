import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiService, type AdminSyncRun } from '../core/api.service';

type Kind = 'discovery' | 'refresh' | 'threads' | 'all';

@Component({
  selector: 'kb-admin-sync',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <h3>{{ t('admin.budget') }} ({{ month() }})</h3>
      @for (u of usage(); track u.sku) {
        <div class="bud">
          <span>{{ u.sku }}</span>
          <div class="bar"><i [style.width.%]="pct(u.used, u.cap)" [class.hot]="pct(u.used, u.cap) > 85"></i></div>
          <span class="muted">{{ u.used }} / {{ u.cap }}</span>
        </div>
      }
      <div class="tools" style="margin-top: 14px">
        @for (k of kinds; track k) {
          <button type="button" class="chip sm" (click)="run(k)">{{ t('admin.runNow') }}: {{ k }}</button>
        }
      </div>
      <div class="scan">
        <button type="button" class="chip sm" data-scan (click)="scanAll()" [disabled]="scanning()">{{ t('admin.scanAll') }}</button>
        @if (scanTotal()) {
          <div class="bar"><i [style.width.%]="pct(scanDone(), scanTotal())"></i></div>
          <span class="muted">{{ scanDone() }} / {{ scanTotal() }} · +{{ scanAdded() }} {{ t('admin.scanNew') }}</span>
        }
        @if (scanError(); as err) {
          <span class="danger">{{ err }}</span>
        }
      </div>
      <div class="scan">
        <button type="button" class="chip sm" data-ratings (click)="pullRatings()" [disabled]="rating()">{{ t('admin.pullRatings') }}</button>
        @if (ratingTotal()) {
          <div class="bar"><i [style.width.%]="pct(ratingDone(), ratingTotal())"></i></div>
          <span class="muted" data-ratings-progress>{{ ratingDone() }} / {{ ratingTotal() }}</span>
        }
        @if (ratingError(); as err) {
          <span class="danger">{{ err }}</span>
        }
      </div>
      <div class="scroll">
        <table>
          <thead><tr><th>#</th><th>kind</th><th>start</th><th>calls</th><th>+places</th><th>upd</th><th>dead</th><th>+ext</th><th>threads</th><th>error / notes</th></tr></thead>
          <tbody>
            @for (r of runs(); track r.id) {
              <tr>
                <td class="muted">{{ r.id }}</td><td>{{ r.kind }}</td><td class="muted">{{ r.startedAt.slice(5, 16).replace('T', ' ') }}</td>
                <td>{{ r.callsUsed }}</td><td>{{ r.placesAdded }}</td><td>{{ r.placesUpdated }}</td><td>{{ r.markedDead }}</td><td>{{ r.externalAdded }}</td>
                <td>{{ r.threadsStatus ?? '—' }}</td><td><span class="danger">{{ r.error }}</span> <span class="muted">{{ r.notes }}</span></td>
              </tr>
            } @empty {
              <tr><td colspan="10" class="muted">{{ t('admin.empty') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </ng-container>
  `,
  styleUrl: './admin.scss',
  styles: `
    h3 { font-family: var(--font-display); font-size: 14px; font-weight: 600; margin: 0 0 8px; }
    .bud { display: grid; grid-template-columns: 1fr 2fr auto; gap: 10px; align-items: center; font-size: 12px; padding: 4px 0; }
    .bar { height: 8px; border-radius: 4px; background: var(--hover); overflow: hidden; }
    .bar i { display: block; height: 100%; background: var(--ok); }
    .bar i.hot { background: var(--bad); }
    .scan { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; font-size: 12px; margin: 10px 0 14px; }
    .scan .danger { grid-column: 1 / -1; }
  `,
})
export class SyncTab {
  private readonly api = inject(ApiService);
  readonly kinds: Kind[] = ['discovery', 'refresh', 'threads', 'all'];
  readonly runs = signal<AdminSyncRun[]>([]);
  readonly usage = signal<{ sku: string; used: number; cap: number }[]>([]);
  readonly month = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.api.admin.syncRuns().subscribe((r) => this.runs.set(r));
    this.api.admin.budget().subscribe((b) => {
      this.usage.set(b.usage);
      this.month.set(b.month);
    });
  }

  pct(used: number, cap: number): number {
    return cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  }

  run(kind: Kind): void {
    this.api.admin.sync(kind).subscribe(() => setTimeout(() => this.load(), 1500));
  }

  readonly scanning = signal(false);
  readonly scanDone = signal(0);
  readonly scanTotal = signal(0);
  readonly scanAdded = signal(0);
  readonly scanError = signal<string | null>(null);

  /** One full pass over the city: the server does a chunk per request, we keep asking until every pair is covered. */
  async scanAll(): Promise<void> {
    if (this.scanning()) return;
    this.scanning.set(true);
    this.scanDone.set(0);
    this.scanAdded.set(0);
    this.scanError.set(null);
    try {
      for (;;) {
        const r = await firstValueFrom(this.api.admin.scan('lviv'));
        this.scanTotal.set(r.total);
        this.scanDone.update((d) => Math.min(r.total, d + r.done));
        this.scanAdded.update((a) => a + r.placesAdded);
        if (r.done === 0) {
          this.scanError.set(r.error || r.notes.join(', ') || 'no progress');
          break;
        }
        if (this.scanDone() >= r.total) break;
      }
    } catch (e) {
      this.scanError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.scanning.set(false);
      this.load();
    }
  }

  readonly rating = signal(false);
  readonly ratingDone = signal(0);
  readonly ratingTotal = signal(0);
  readonly ratingError = signal<string | null>(null);

  /** Google ratings + reviews for every never-rated place, one server chunk per request. */
  async pullRatings(): Promise<void> {
    if (this.rating()) return;
    this.rating.set(true);
    this.ratingDone.set(0);
    this.ratingTotal.set(0);
    this.ratingError.set(null);
    try {
      for (;;) {
        const r = await firstValueFrom(this.api.admin.ratings());
        this.ratingDone.update((d) => d + r.done);
        this.ratingTotal.set(this.ratingDone() + r.remaining);
        if (r.remaining === 0) break;
        if (r.done === 0) {
          this.ratingError.set(r.error || r.notes.join(', ') || 'no progress');
          break;
        }
      }
    } catch (e) {
      this.ratingError.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.rating.set(false);
      this.load();
    }
  }
}
