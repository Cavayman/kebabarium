import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor, type NearResponse } from '@kebabarium/shared';
import { reviewsText } from '../ui/count';
import { GlassPanelComponent } from '../ui/glass-panel.component';
import { IconComponent } from '../ui/icon.component';
import type { Radius } from './nearby.service';

@Component({
  selector: 'kb-nearby-panel',
  imports: [GlassPanelComponent, IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <kb-glass-panel class="near" panelId="near" icon="nav" [title]="t('near.title')" [closable]="true" [closeLabel]="t('layout.close')" (closed)="closed.emit()">
        <div panel-extra class="rads" data-nodrag role="radiogroup">
          @for (r of radii; track r) {
            <button type="button" role="radio" [attr.aria-checked]="result()?.radiusKm === r" [class.on]="result()?.radiusKm === r" (click)="radius.emit(r)">
              {{ t('near.km', { n: r }) }}
            </button>
          }
        </div>
        @if (result()?.autoWidened) {
          <p class="note">{{ t('near.widened', { km: result()!.radiusKm }) }}</p>
        }
        <div class="list">
          @for (p of result()?.items ?? []; track p.id; let i = $index) {
            <div class="ni" [style.animation-delay.ms]="i * 90" (click)="pick.emit(p.id)">
              <div class="sc" [style.background]="color(p.score)">{{ p.score?.toFixed(1) ?? '—' }}</div>
              <div class="tx">
                <b>{{ p.name }}</b>
                <span>
                  {{ p.distanceM < 1000 ? t('near.m', { n: p.distanceM }) : t('near.km', { n: (p.distanceM / 1000).toFixed(1) }) }}
                  · {{ t('near.walk', { min: p.walkMin }) }}
                  @if (i === 0 && p.score != null) {
                    · <em>{{ t('near.best') }}</em>
                  }
                </span>
                <span class="rv" [class.none]="!p.reviewCount" [class.many]="p.reviewCount >= 500"><kb-icon name="chat" [size]="10" />{{ reviews(p.reviewCount) }}</span>
              </div>
              <a class="go mini" [href]="'https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=' + p.lat + ',' + p.lng" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()" [attr.aria-label]="t('card.route')"><kb-icon name="nav" [size]="13" /></a>
            </div>
          } @empty {
            <p class="note">{{ t('near.empty') }}</p>
          }
        </div>
      </kb-glass-panel>
    </ng-container>
  `,
  styles: `
    :host { display: contents; }
    .near { right: 12px; top: 74px; width: 370px; }
    .rads { display: flex; gap: 2px; padding: 2px; border-radius: 999px; background: rgba(255,255,255,.06); margin-right: 4px; }
    .rads button { border: 0; background: none; color: var(--dim); font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 999px; white-space: nowrap; cursor: pointer; }
    .rads button.on { background: var(--acc2); color: #1a0a00; }
    .note { font-size: 11.5px; color: var(--dim); margin: 0 2px 8px; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .ni { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 14px; background: rgba(255,255,255,.04); cursor: pointer; opacity: 0; animation: kb-near-in .4s cubic-bezier(.2,1.4,.4,1) forwards; }
    .ni:hover { background: rgba(255,255,255,.09); }
    .sc { min-width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; font-weight: 800; font-size: 14px; color: #111; }
    .tx { flex: 1; min-width: 0; }
    .tx b { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tx span { font-size: 11px; color: var(--dim); }
    .tx em { font-style: normal; font-weight: 800; color: var(--ok); }
    .rv { display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700; color: var(--fg); background: rgba(255,255,255,.07); font-variant-numeric: tabular-nums; }
    .rv.many { background: color-mix(in srgb, var(--ok) 18%, transparent); color: var(--ok); }
    .rv.none { color: var(--dim); font-weight: 600; background: none; padding-left: 0; }
    .tx > span:first-of-type { display: block; }
    .go { text-decoration: none; }
    @keyframes kb-near-in { from { transform: translateY(10px); opacity: 0; } to { transform: none; opacity: 1; } }
  `,
})
export class NearbyPanel {
  readonly result = input<NearResponse | null>(null);
  readonly radius = output<Radius>();
  readonly pick = output<number>();
  readonly closed = output<void>();
  readonly radii: Radius[] = [1, 2, 5];

  color(v: number | null): string {
    return ratingColor(v);
  }

  private readonly t = inject(TranslocoService);
  reviews(n: number): string {
    return reviewsText(this.t, n);
  }
}
