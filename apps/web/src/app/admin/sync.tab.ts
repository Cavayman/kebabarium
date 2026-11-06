import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
}
