import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { City } from '@kebabarium/shared';
import { IconComponent, LogoMarkComponent } from '../ui/icon.component';

@Component({
  selector: 'kb-navbar',
  imports: [IconComponent, LogoMarkComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'outside($event)', '(document:keydown.escape)': 'cityOpen.set(false)' },
  template: `
    <nav class="pill glass" *transloco="let t">
      <a class="logo" href="/" (click)="$event.preventDefault(); home()" [attr.aria-label]="t('brand')">
        <kb-logo-mark /><span class="word">{{ t('brand') }}</span>
      </a>
      <div class="city">
        <button class="chip" type="button" aria-haspopup="listbox" [attr.aria-expanded]="cityOpen()" (click)="cityOpen.set(!cityOpen())">
          <kb-icon name="pin" [size]="15" /><span>{{ current()?.name }}</span><kb-icon class="car" name="chevron" [size]="12" />
        </button>
        @if (cityOpen()) {
          <ul class="menu glass" role="listbox">
            @for (c of cities(); track c.id) {
              <li role="option" [attr.aria-selected]="c.slug === current()?.slug" (click)="choose(c)">
                {{ c.name }} <small>{{ t('nav.spots', { n: c.spots }) }}</small>
              </li>
            }
          </ul>
        }
      </div>
      <button class="chip" type="button" (click)="near.emit()"><kb-icon name="nav" [size]="15" /><span class="lbl">{{ t('nav.near') }}</span></button>
      <ng-content />
    </nav>
  `,
  styles: `
    :host { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); z-index: 5; max-width: calc(100% - 16px); }
    .pill { display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 999px; white-space: nowrap; }
    .logo { display: flex; align-items: center; gap: 8px; padding: 0 10px 0 6px; color: var(--acc-hover); text-decoration: none; font-family: var(--font-display); font-weight: 800; font-size: 14px; }
    .city { position: relative; }
    .car { opacity: .6; }
    .menu { position: absolute; top: 44px; left: 0; min-width: 190px; margin: 0; padding: 6px; list-style: none; border-radius: 16px; }
    .menu li { padding: 8px 10px; border-radius: 10px; font-size: 13px; cursor: pointer; display: flex; justify-content: space-between; gap: 10px; }
    .menu li:hover, .menu li[aria-selected=true] { background: var(--hover); }
    .menu small { color: var(--dim); }
    @media (max-width: 560px) {
      .word { display: none; }
      .logo { padding: 0 4px; }
      .chip { padding: 0 10px; font-size: 12px; }
    }
    @media (max-width: 360px) { .lbl { display: none; } }
  `,
})
export class NavbarComponent {
  readonly cities = input<City[]>([]);
  readonly current = input<City | null>(null);
  readonly near = output<void>();
  readonly cityOpen = signal(false);
  private readonly router = inject(Router);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  choose(c: City): void {
    this.cityOpen.set(false);
    void this.router.navigate(['/', c.slug]);
  }

  home(): void {
    void this.router.navigate(['/', this.current()?.slug ?? 'lviv']);
  }

  outside(e: Event): void {
    if (this.cityOpen() && !this.el.nativeElement.contains(e.target as Node)) this.cityOpen.set(false);
  }
}
