import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor } from '@kebabarium/shared';
import { firstValueFrom } from 'rxjs';
import { AuthStore } from '../../auth/auth.store';
import { ApiService, type MyRatings } from '../../core/api.service';
import { ToastService } from '../../ui/toast';

/** /me — my count, my personal top and my rating timeline (edit/delete). */
@Component({
  selector: 'kb-me',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './me.page.html',
  styleUrl: './me.page.scss',
})
export class MePage {
  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  readonly data = signal<MyRatings | null>(null);
  readonly editing = signal<number | null>(null);
  readonly editStars = signal(0);
  readonly editText = signal('');

  constructor() {
    this.reload();
  }

  reload(): void {
    this.api.myRatings().subscribe({ next: (d) => this.data.set(d), error: () => this.data.set({ history: [], top: [], count: 0 }) });
  }

  color(v: number | null): string {
    return ratingColor(v);
  }

  startEdit(placeId: number, stars: number, text: string | null): void {
    this.editing.set(placeId);
    this.editStars.set(stars);
    this.editText.set(text ?? '');
  }

  async save(placeId: number): Promise<void> {
    try {
      const text = this.editText().trim();
      await firstValueFrom(this.api.editRating(placeId, { stars: this.editStars(), ...(text ? { text } : {}) }));
      this.editing.set(null);
      this.reload();
    } catch {
      this.toast.show(this.t.translate('review.errNetwork'));
    }
  }

  async remove(placeId: number): Promise<void> {
    if (!confirm(this.t.translate('me.confirmDelete'))) return;
    try {
      await firstValueFrom(this.api.deleteRating(placeId));
      this.reload();
    } catch {
      this.toast.show(this.t.translate('review.errNetwork'));
    }
  }
}
