import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, output } from '@angular/core';
import { LayoutStore, type PanelId } from '../state/layout.store';
import { IconComponent, type IconName } from './icon.component';

/** Frosted-glass window: drag by the header on desktop (position remembered), collapse with "−", bottom sheet on phones. */
@Component({
  selector: 'kb-glass-panel',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'glass',
    '[class.sheet]': 'layout.mobile()',
    '[class.dragged]': '!!pos()',
    '[style.left.px]': 'pos()?.x',
    '[style.top.px]': 'pos()?.y',
    '[attr.role]': '"region"',
    '[attr.aria-label]': 'title()',
  },
  template: `
    <header class="ph" (pointerdown)="dragStart($event)">
      @if (!layout.mobile()) {
        <kb-icon class="grip" name="grip" [size]="12" />
      }
      <h2><kb-icon [name]="icon()" />{{ title() }}</h2>
      <ng-content select="[panel-extra]" />
      @if (closable()) {
        <button class="mini" type="button" (click)="closed.emit()" [attr.aria-label]="closeLabel()"><kb-icon name="close" [size]="13" /></button>
      } @else {
        <button class="mini" type="button" (click)="layout.collapse(panelId())" [attr.aria-label]="closeLabel()"><kb-icon name="minus" [size]="14" /></button>
      }
    </header>
    <div class="pb"><ng-content /></div>
  `,
  styleUrl: './glass-panel.component.scss',
})
export class GlassPanelComponent {
  readonly panelId = input.required<PanelId>();
  readonly title = input.required<string>();
  readonly icon = input.required<IconName>();
  readonly closable = input(false);
  readonly closeLabel = input('');
  readonly closed = output<void>();

  protected readonly layout = inject(LayoutStore);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly pos = computed(() => this.layout.position(this.panelId()));

  dragStart(e: PointerEvent): void {
    if (this.layout.mobile() || (e.target as HTMLElement).closest('button,a,input,select,[data-nodrag],.seg')) return;
    const host = this.el.nativeElement;
    const r = host.getBoundingClientRect();
    const parent = host.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const ox = e.clientX - r.left;
    const oy = e.clientY - r.top;
    const header = e.currentTarget as HTMLElement;
    header.setPointerCapture?.(e.pointerId);
    host.classList.add('dragging');
    let last = { x: r.left - parent.left, y: r.top - parent.top };
    const move = (ev: PointerEvent) => {
      last = {
        x: Math.round(Math.max(6, Math.min(parent.width - r.width - 6, ev.clientX - parent.left - ox))),
        y: Math.round(Math.max(6, Math.min(parent.height - 40, ev.clientY - parent.top - oy))),
      };
      host.style.left = `${last.x}px`;
      host.style.top = `${last.y}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    };
    const up = () => {
      host.classList.remove('dragging');
      header.removeEventListener('pointermove', move);
      header.removeEventListener('pointerup', up);
      header.removeEventListener('pointercancel', up);
      this.layout.savePosition(this.panelId(), last);
    };
    header.addEventListener('pointermove', move);
    header.addEventListener('pointerup', up);
    header.addEventListener('pointercancel', up);
  }
}
