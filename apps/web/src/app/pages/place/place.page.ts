import { ChangeDetectionStrategy, Component, inject, input, numberAttribute, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { PlaceDetail, PlaceSummary } from '@kebabarium/shared';
import { PlaceCardComponent } from '../../place/place-card.component';
import { ReviewModalComponent } from '../../review/review-modal.component';
import { ToastService } from '../../ui/toast';

/** /:city/place/:id — the full card with all reviews and move history. */
@Component({
  selector: 'kb-place-page',
  imports: [PlaceCardComponent, ReviewModalComponent, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" *transloco="let t">
      <a class="back chip glass" [routerLink]="['/', city()]">← {{ t('notFound.back') }}</a>
      <kb-place-card [placeId]="id()" [city]="city()" [full]="true" (rate)="reviewing.set(true)" (loaded)="onLoaded($event)" />
    </main>
    @if (reviewing() && place(); as p) {
      <kb-review-modal [places]="[p]" [placeId]="p.id" (closed)="reviewing.set(false)" (submitted)="onReviewed($event.status)" />
    }
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .wrap { max-width: 640px; margin: 0 auto; padding: 16px 12px 48px; display: flex; flex-direction: column; gap: 12px; }
    .back { align-self: flex-start; border: 1px solid var(--edge); }
  `,
})
export class PlacePage {
  readonly city = input.required<string>();
  readonly id = input.required({ transform: numberAttribute });
  readonly reviewing = signal(false);
  readonly place = signal<PlaceSummary | null>(null);
  private readonly title = inject(Title);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);

  onLoaded(d: PlaceDetail): void {
    this.place.set(d);
    this.title.setTitle(`${d.name} · Кебабаріум`);
  }

  onReviewed(status: 'published' | 'pending'): void {
    this.toast.show(this.t.translate('review.sent', { status: this.t.translate(status === 'published' ? 'review.statusPublished' : 'review.statusPending') }));
  }
}
