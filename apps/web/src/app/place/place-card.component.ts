import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ratingColor, type PlaceDetail } from '@kebabarium/shared';
import { ApiService } from '../core/api.service';
import { IconComponent } from '../ui/icon.component';
import { LogoTileComponent } from './logo-tile.component';

/** Detail card for a column: stays open until closed (no hover flicker). Also the body of the place page. */
@Component({
  selector: 'kb-place-card',
  imports: [LogoTileComponent, IconComponent, TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './place-card.component.html',
  styleUrl: './place-card.component.scss',
})
export class PlaceCardComponent {
  readonly placeId = input.required<number>();
  readonly city = input('lviv');
  /** Full page mode: more reviews, no close button. */
  readonly full = input(false);
  readonly closed = output<void>();
  readonly rate = output<number>();
  readonly loaded = output<PlaceDetail>();

  readonly detail = signal<PlaceDetail | null>(null);
  readonly error = signal(false);
  private readonly api = inject(ApiService);

  constructor() {
    effect((onCleanup) => {
      const id = this.placeId();
      this.detail.set(null);
      this.error.set(false);
      const sub = this.api.place(id, this.full() ? 50 : undefined).subscribe({
        next: (d) => {
          this.detail.set(d);
          this.loaded.emit(d);
        },
        error: () => this.error.set(true),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  color(v: number | null): string {
    return ratingColor(v);
  }

  stars(n: number | null): string {
    return n ? '★'.repeat(n) : '';
  }

  routeUrl(d: PlaceDetail): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  }

  ago(iso: string): string {
    const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
    const lang = document.documentElement.lang === 'en' ? 'en' : 'uk';
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto', style: 'short' });
    if (s < 3600) return rtf.format(-Math.round(s / 60) || -1, 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    if (s < 86400 * 30) return rtf.format(-Math.round(s / 86400), 'day');
    return rtf.format(-Math.round(s / (86400 * 30)), 'month');
  }
}
