import { HttpErrorResponse } from '@angular/common/http';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { ApiErrorBody, PlaceSummary, ReviewResult } from '@kebabarium/shared';
import { AuthStore } from '../auth/auth.store';
import { ApiService } from '../core/api.service';
import { ConfigStore } from '../core/config.store';
import { IconComponent } from '../ui/icon.component';
import { renderTurnstile } from './turnstile';

const MAX_TEXT = 280;

@Component({
  selector: 'kb-review-modal',
  imports: [IconComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closed.emit()' },
  templateUrl: './review-modal.component.html',
  styleUrl: './review-modal.component.scss',
})
export class ReviewModalComponent {
  readonly places = input<PlaceSummary[]>([]);
  readonly placeId = input<number | null>(null);
  readonly closed = output<void>();
  readonly submitted = output<ReviewResult & { placeId: number }>();

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly cfg = inject(ConfigStore);
  private readonly t = inject(TranslocoService);

  readonly maxText = MAX_TEXT;
  readonly query = signal('');
  readonly chosen = signal<number | null>(null);
  readonly stars = signal(0);
  readonly hover = signal(0);
  readonly text = signal('');
  readonly nickname = signal('');
  readonly error = signal<string | null>(null);
  readonly sending = signal(false);
  private token: string | null = null;

  private readonly placeInput = viewChild<ElementRef<HTMLInputElement>>('placeInput');
  private readonly textArea = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');
  private readonly turnstileEl = viewChild<ElementRef<HTMLElement>>('turnstile');

  readonly selected = computed(() => this.places().find((p) => p.id === (this.chosen() ?? this.placeId())) ?? null);
  readonly open = computed(() => this.places().filter((p) => p.status !== 'dead' && p.status !== 'hidden'));
  readonly suggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q || this.selected()?.name.toLowerCase() === q) return [];
    return this.open()
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  });
  readonly words = computed(() => this.t.translateObject<string[]>('review.words') ?? []);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const pre = this.selected();
      if (pre) {
        this.query.set(pre.name);
        this.textArea()?.nativeElement.focus();
      } else {
        this.placeInput()?.nativeElement.focus();
      }
      const key = this.cfg.config()?.turnstileSiteKey;
      const el = this.turnstileEl()?.nativeElement;
      if (key && el && !this.auth.me()) {
        void renderTurnstile(el, key, (tok) => (this.token = tok))
          .then((remove) => destroy.onDestroy(remove))
          .catch(() => this.error.set(this.t.translate('review.errBot')));
      }
    });
  }

  choose(p: PlaceSummary): void {
    this.chosen.set(p.id);
    this.query.set(p.name);
    this.error.set(null);
  }

  onQuery(v: string): void {
    this.query.set(v);
    if (this.selected()?.name !== v) this.chosen.set(null);
  }

  send(): void {
    const place = this.selected();
    if (!place || place.status === 'dead') return this.error.set(this.t.translate('review.errPlace'));
    if (!this.stars()) return this.error.set(this.t.translate('review.errStars'));
    this.error.set(null);
    this.sending.set(true);
    const text = this.text().trim();
    const nickname = this.nickname().trim();
    this.api
      .submitReview(place.id, {
        stars: this.stars() as 1 | 2 | 3 | 4 | 5,
        ...(text ? { text } : {}),
        ...(nickname && !this.auth.me() ? { nickname } : {}),
        ...(this.token ? { turnstileToken: this.token } : {}),
      })
      .subscribe({
        next: (r) => {
          this.sending.set(false);
          this.submitted.emit({ ...r, placeId: place.id });
          this.closed.emit();
        },
        error: (e: HttpErrorResponse) => {
          this.sending.set(false);
          this.error.set(this.messageFor(e));
        },
      });
  }

  private messageFor(e: HttpErrorResponse): string {
    const body = e.error as ApiErrorBody | null;
    switch (body?.error?.code) {
      case 'cooldown':
        return this.t.translate('review.errCooldown', { days: Math.max(1, Math.ceil((body.error.retryAfterSec ?? 86400) / 86400)) });
      case 'rate_limited':
        return this.t.translate('review.errRate');
      case 'banned':
        return this.t.translate('review.errBanned');
      case 'turnstile_failed':
        return this.t.translate('review.errBot');
      case 'place_closed':
        return this.t.translate('review.errClosed');
      default:
        return this.t.translate('review.errNetwork');
    }
  }
}
