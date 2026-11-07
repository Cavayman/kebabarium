import { afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { FeedItem, ReviewSource } from '@kebabarium/shared';
import type { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { GlassPanelComponent } from '../ui/glass-panel.component';
import { pageLang, reviewTime } from '../ui/time';

export interface DropEvent {
  placeId: number;
  stars: number | null;
  caption: string;
}

type Filter = 'all' | ReviewSource;
const POLL_MS = 15_000;
const TYPING_MS = 1_100;
const GAP_MS = 2_600;
const KEEP = 30;
const AVATAR_COLORS = ['#ff7a00', '#4f8cff', '#3ee07a', '#b06bff', '#ffb347', '#ff6b8a'];

@Component({
  selector: 'kb-feed-panel',
  imports: [GlassPanelComponent, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feed.panel.html',
  styleUrl: './feed.panel.scss',
})
export class FeedPanel {
  readonly city = input.required<string>();
  readonly drop = output<DropEvent>();
  readonly pick = output<number>();

  readonly filters: Filter[] = ['all', 'ours', 'google', 'threads'];
  readonly filter = signal<Filter>('all');
  readonly items = signal<FeedItem[]>([]); // oldest first (chat order)
  readonly typing = signal(false);
  readonly threadsDown = signal(false);

  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private since: string | null = null;
  private queue: FeedItem[] = [];
  private pumping = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private poll?: ReturnType<typeof setInterval>;
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const city = this.city();
      const filter = this.filter();
      untracked(() => this.restart(city, filter));
    });
    // chat behaviour: keep the newest message in view
    afterRenderEffect(() => {
      this.items();
      this.typing();
      const el = this.log()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private stop(): void {
    clearInterval(this.poll);
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.sub?.unsubscribe();
  }

  private restart(city: string, filter: Filter): void {
    this.stop();
    this.queue = [];
    this.pumping = false;
    this.typing.set(false);
    this.sub = this.api.feed(city, { source: filter }).subscribe({
      next: (res) => {
        this.items.set([...res.items].reverse());
        this.threadsDown.set(res.threadsStatus === 'unavailable');
        this.since = res.items[0]?.createdAt ?? res.now;
      },
      error: () => this.items.set([]),
    });
    this.poll = setInterval(() => this.fetchNew(city, filter), POLL_MS);
  }

  private fetchNew(city: string, filter: Filter): void {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    this.sub?.unsubscribe();
    this.sub = this.api.feed(city, { source: filter, since: this.since ?? undefined }).subscribe({
      next: (res) => {
        this.threadsDown.set(res.threadsStatus === 'unavailable');
        const known = new Set([...this.items(), ...this.queue].map((i) => i.id));
        const fresh = res.items.filter((i) => !known.has(i.id));
        if (!fresh.length) return;
        this.since = fresh[0]!.createdAt > (this.since ?? '') ? fresh[0]!.createdAt : this.since;
        this.queue.push(...fresh.reverse());
        this.pump();
      },
    });
  }

  /** One message at a time: "…typing" bubble, the message, the drop animation, a pause. */
  private pump(): void {
    if (this.pumping) return;
    const next = this.queue.shift();
    if (!next) return;
    this.pumping = true;
    this.typing.set(true);
    this.timers.push(
      setTimeout(() => {
        this.typing.set(false);
        this.items.update((all) => [...all, next].slice(-KEEP));
        if (next.placeId != null) this.drop.emit({ placeId: next.placeId, stars: next.stars, caption: this.caption(next) });
        this.timers.push(
          setTimeout(() => {
            this.pumping = false;
            this.pump();
          }, GAP_MS),
        );
      }, TYPING_MS),
    );
  }

  caption(i: FeedItem): string {
    if (i.source === 'threads') return this.t.translate('caption.threads');
    if (i.stars != null && i.stars <= 2) return this.t.translate('caption.low', { n: i.stars });
    if (i.source === 'google') return this.t.translate('caption.google', { n: i.stars ?? '' });
    return this.t.translate('caption.rated', { who: i.author, n: i.stars ?? '' });
  }

  initial(name: string): string {
    return (name.replace(/^@/, '').trim()[0] ?? '?').toUpperCase();
  }

  avatarColor(name: string): string {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
  }

  stars(n: number | null): string {
    return n ? '★'.repeat(n) : '';
  }

  when(iso: string): { short: string; full: string } {
    return reviewTime(iso, pageLang());
  }
}
