import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor, type LeaderboardKind, type LeaderboardRow } from '@kebabarium/shared';
import { ApiService } from '../core/api.service';
import { formatCount, reviewsText } from '../ui/count';
import { GlassPanelComponent } from '../ui/glass-panel.component';
import { IconComponent } from '../ui/icon.component';

@Component({
  selector: 'kb-leaderboard-panel',
  imports: [GlassPanelComponent, IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <kb-glass-panel class="lb" panelId="lb" icon="trophy" [title]="t('lb.title', { city: cityName() })" [closeLabel]="t('layout.collapse')">
        <div class="seg" role="tablist">
          @for (k of kinds; track k) {
            <button type="button" role="tab" [class.on]="kind() === k" [attr.aria-selected]="kind() === k" (click)="kind.set(k)">{{ t('lb.' + k) }}</button>
          }
        </div>
        <ol class="rows">
          @for (r of rows(); track r.id) {
            <li class="row" [class.clickable]="r.kind === 'spots'" (click)="r.kind === 'spots' && pick.emit(+r.id)">
              <span class="rank" [class]="'rank rank-' + r.rank">{{ r.rank }}</span>
              <span class="nm" [attr.title]="r.name">{{ r.name }}</span>
              @if (r.kind === 'spots' && r.extra) {
                <span class="n" [attr.title]="reviews(r.extra)"><kb-icon name="chat" [size]="10" />{{ count(r.extra) }}</span>
              }
              @if (r.kind === 'tasters') {
                <span class="v count">{{ r.value }}</span>
              } @else {
                <span class="v" [style.color]="color(r.value)">{{ r.kind === 'districts' ? r.value.toFixed(2) : r.value.toFixed(1) }}</span>
              }
            </li>
          } @empty {
            <li class="empty">{{ t('lb.empty') }}</li>
          }
        </ol>
      </kb-glass-panel>
    </ng-container>
  `,
  styles: `
    :host { display: contents; }
    .lb { left: 12px; top: 74px; width: 290px; }
    .seg { margin-bottom: 8px; }
    .rows { list-style: none; margin: 0; padding: 0; }
    .row { display: flex; align-items: center; gap: 10px; padding: 7px 4px; border-radius: 12px; font-size: 13px; }
    .row.clickable { cursor: pointer; }
    .row:hover { background: var(--hover); }
    .rank { width: 22px; height: 22px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--dim); background: rgba(255,255,255,.06); }
    .rank-1 { background: linear-gradient(135deg, #ffe08a, #e0a800); color: #2a1d00; }
    .rank-2 { background: linear-gradient(135deg, #f2f2f2, #a8a8a8); color: #222; }
    .rank-3 { background: linear-gradient(135deg, #f0b27a, #a8601f); color: #2a1300; }
    .nm { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .v { font-weight: 800; font-variant-numeric: tabular-nums; }
    .count { color: var(--dim); }
    .n { display: inline-flex; align-items: center; gap: 3px; flex: none; font-size: 10.5px; color: var(--dim); font-variant-numeric: tabular-nums; opacity: .85; }
    .empty { color: var(--dim); font-size: 12px; padding: 8px 4px; }
  `,
})
export class LeaderboardPanel {
  readonly city = input.required<string>();
  readonly cityName = input.required<string>();
  readonly pick = output<number>();

  readonly kinds: LeaderboardKind[] = ['spots', 'chains', 'districts', 'tasters'];
  readonly kind = signal<LeaderboardKind>('spots');
  readonly rows = signal<LeaderboardRow[]>([]);
  private readonly api = inject(ApiService);

  constructor() {
    effect((onCleanup) => {
      const sub = this.api.leaderboard(this.city(), this.kind()).subscribe({ next: (r) => this.rows.set(r), error: () => this.rows.set([]) });
      onCleanup(() => sub.unsubscribe());
    });
  }

  color(v: number): string {
    return ratingColor(v);
  }

  private readonly t = inject(TranslocoService);
  count(n: string | undefined): string {
    return formatCount(this.t, Number(n ?? 0));
  }
  reviews(n: string | undefined): string {
    return reviewsText(this.t, Number(n ?? 0));
  }
}
