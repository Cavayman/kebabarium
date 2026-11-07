import { afterRenderEffect, ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { CHAT_MAX_TEXT, type ChatMessage } from '@kebabarium/shared';
import type { Subscription } from 'rxjs';
import { AuthStore } from '../auth/auth.store';
import { ApiService } from '../core/api.service';
import { GlassPanelComponent } from '../ui/glass-panel.component';
import { IconComponent } from '../ui/icon.component';
import { asTimeLang, reviewTime } from '../ui/time';

const POLL_MS = 5_000;
const KEEP = 200;
const AVATAR_COLORS = ['#ff7a00', '#4f8cff', '#3ee07a', '#b06bff', '#ffb347', '#ff6b8a'];
const KNOWN_ERRORS = ['chat_cooldown', 'rate_limited', 'links_not_allowed', 'nickname_required', 'banned', 'unauthenticated'];

/** The city's chat room: everyone reads, signed-in people with a public name write. Polls for new messages. */
@Component({
  selector: 'kb-chat-panel',
  imports: [GlassPanelComponent, IconComponent, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat.panel.html',
  styleUrl: './chat.panel.scss',
})
export class ChatPanel {
  readonly city = input.required<string>();

  readonly items = signal<ChatMessage[]>([]);
  readonly canPost = signal(false);
  readonly draft = signal('');
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly max = CHAT_MAX_TEXT;

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');
  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  private poll?: ReturnType<typeof setInterval>;
  private sub?: Subscription;

  constructor() {
    effect(() => {
      const city = this.city();
      this.auth.me(); // reload when the viewer signs in or out: canPost and "own" depend on it
      untracked(() => this.start(city));
    });
    afterRenderEffect(() => {
      this.items();
      const el = this.log()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  private stop(): void {
    clearInterval(this.poll);
    this.sub?.unsubscribe();
  }

  private start(city: string): void {
    this.stop();
    this.items.set([]);
    this.sub = this.api.chat(city).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.canPost.set(r.canPost);
      },
      error: () => this.items.set([]),
    });
    this.poll = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      const last = this.items().at(-1)?.id;
      this.sub = this.api.chat(city, last).subscribe({
        next: (r) => {
          const known = new Set(this.items().map((m) => m.id));
          const fresh = r.items.filter((m) => !known.has(m.id));
          if (fresh.length) this.items.update((all) => [...all, ...fresh].slice(-KEEP));
          this.canPost.set(r.canPost);
        },
      });
    }, POLL_MS);
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  send(): void {
    const text = this.draft().trim();
    if (!text || this.sending()) return;
    this.sending.set(true);
    this.error.set(null);
    this.api.say(this.city(), text).subscribe({
      next: (m) => {
        this.items.update((all) => (all.some((x) => x.id === m.id) ? all : [...all, m]).slice(-KEEP));
        this.draft.set('');
        const box = this.box()?.nativeElement;
        if (box) box.value = '';
        this.sending.set(false);
      },
      error: (e: HttpErrorResponse) => {
        const code = (e.error as { error?: { code?: string } } | null)?.error?.code ?? '';
        this.error.set(this.t.translate(`chat.err.${KNOWN_ERRORS.includes(code) ? code : 'generic'}`));
        this.sending.set(false);
      },
    });
  }

  when(iso: string): string {
    return reviewTime(iso, asTimeLang(this.t.getActiveLang())).short;
  }
  full(iso: string): string {
    return reviewTime(iso, asTimeLang(this.t.getActiveLang())).full;
  }
  initial(name: string): string {
    return [...(name.trim() || '?')][0]!.toUpperCase();
  }
  color(name: string): string {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
  }
}
