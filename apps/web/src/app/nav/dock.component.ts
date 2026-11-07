import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LayoutStore, type PanelId } from '../state/layout.store';
import { IconComponent } from '../ui/icon.component';

/** Bottom-centre controls: pills for collapsed panels and the flat orange "Залишити відгук" button. */
@Component({
  selector: 'kb-dock',
  imports: [IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      @if (pills().length) {
        <div class="pills">
          @for (id of pills(); track id) {
            <button type="button" class="chip glass" (click)="layout.open(id)">
              @switch (id) {
                @case ('lb') { <kb-icon name="trophy" [size]="15" />{{ t('lb.short') }} }
                @case ('chat') { <kb-icon name="users" [size]="15" />{{ t('chat.title') }} }
                @default { <kb-icon name="chat" [size]="15" />{{ t('feed.title') }}<i class="dot"></i> }
              }
            </button>
          }
        </div>
      }
      <button type="button" class="fab" (click)="review.emit()"><kb-icon name="pen" [size]="17" />{{ t('fab.review') }}</button>
    </ng-container>
  `,
  styles: `
    :host { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 6; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .pills { display: flex; gap: 8px; }
    .pills .chip { border: 1px solid var(--edge); }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); font-style: normal; }
    .fab { display: inline-flex; align-items: center; gap: 8px; height: 48px; padding: 0 22px; border: 0; border-radius: 999px; background: var(--acc); color: #fff;
      font-size: 15px; font-weight: 700; white-space: nowrap; cursor: pointer; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45); transition: transform .15s, background .15s; }
    .fab:hover { background: var(--acc-hover); transform: translateY(-1px); }
    .fab:active { transform: scale(.97); }
    .fab:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    @media (max-width: 560px) { :host { bottom: 12px; } .fab { height: 46px; } }
  `,
})
export class DockComponent {
  protected readonly layout = inject(LayoutStore);
  /** Limit the pills (the dashboard has no leaderboard/feed panels, only the chat). */
  readonly only = input<PanelId[] | null>(null);
  readonly review = output<void>();
  readonly pills = computed(() => {
    const only = this.only();
    return this.layout.collapsedPills().filter((id) => !only || only.includes(id));
  });
}
