import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ratingStops } from '@kebabarium/shared';

/** Rating legend: same stops as the columns, labels 1 / 3 / 5. Hidden on phones. */
@Component({
  selector: 'kb-legend',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="legend glass" *transloco="let t">
      <span>{{ t('legend.caption') }}</span>
      <div class="grad" [style.background]="gradient"></div>
      <div class="lbls"><span>1</span><span>3</span><span>5</span></div>
    </div>
  `,
  styles: `
    :host { position: absolute; left: 12px; bottom: 14px; z-index: 3; }
    .legend { width: 200px; padding: 8px 12px; font-size: 11px; color: var(--dim); border-radius: 16px; }
    .grad { height: 8px; border-radius: 4px; margin: 5px 0 3px; }
    .lbls { display: flex; justify-content: space-between; }
    @media (max-width: 560px) { :host { display: none; } }
  `,
})
export class LegendComponent {
  /** Stops span 1..4.9 on a 1..5 axis. */
  readonly gradient = `linear-gradient(90deg, ${ratingStops()
    .map(([v, c]) => `${c} ${Math.round(((v - 1) / 4) * 100)}%`)
    .join(', ')}, #22c77a 100%)`;
}
