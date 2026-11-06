import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { ApiErrorBody } from '@kebabarium/shared';
import { ConfigStore } from '../core/config.store';
import { LangService, type Lang } from '../core/i18n';
import { IconComponent } from '../ui/icon.component';
import { ToastService } from '../ui/toast';
import { AuthStore } from './auth.store';
import { renderGoogleButton } from './google-signin';

const NICK_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;

/** Navbar end: "Увійти" (login sheet with Google) or the avatar with the profile menu; first-login nickname dialog. */
@Component({
  selector: 'kb-account',
  imports: [IconComponent, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'outside($event)', '(document:keydown.escape)': 'menuOpen.set(false); loginOpen.set(false)' },
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly langs = inject(LangService);
  private readonly cfg = inject(ConfigStore);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly menuOpen = signal(false);
  readonly loginOpen = signal(false);
  readonly nicknameOpen = signal(false);
  readonly nick = signal('');
  readonly nickError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly clientId = computed(() => this.cfg.config()?.googleClientId ?? null);
  readonly initial = computed(() => (this.auth.me()?.displayName.trim()[0] ?? '?').toUpperCase());
  private readonly gisEl = viewChild<ElementRef<HTMLElement>>('gis');

  constructor() {
    effect(() => {
      const el = this.gisEl()?.nativeElement;
      const id = this.clientId();
      if (el && id && this.loginOpen()) {
        void renderGoogleButton(el, id, this.langs.current(), (jwt) => this.onCredential(jwt)).catch(() =>
          this.toast.show(this.t.translate('review.errNetwork')),
        );
      }
    });
  }

  onCredential(jwt: string): void {
    this.busy.set(true);
    this.auth.login(jwt).then(
      (res) => {
        this.busy.set(false);
        this.loginOpen.set(false);
        if (res.needsNickname) {
          this.nick.set(res.suggestedNickname ?? '');
          this.nicknameOpen.set(true);
        }
      },
      () => {
        this.busy.set(false);
        this.toast.show(this.t.translate('review.errNetwork'));
      },
    );
  }

  saveNickname(): void {
    const n = this.nick().trim();
    if (!NICK_RE.test(n)) return this.nickError.set(this.t.translate('auth.nickBad'));
    this.busy.set(true);
    this.auth.update({ nickname: n }).then(
      () => {
        this.busy.set(false);
        this.nicknameOpen.set(false);
      },
      (e: HttpErrorResponse) => {
        this.busy.set(false);
        const code = (e.error as ApiErrorBody | null)?.error?.code;
        this.nickError.set(this.t.translate(code === 'nickname_taken' ? 'auth.nickTaken' : code === 'validation_error' ? 'auth.nickBad' : 'review.errNetwork'));
      },
    );
  }

  setLang(lang: Lang): void {
    this.langs.set(lang);
    if (this.auth.me()) void this.auth.update({ lang }).catch(() => undefined);
  }

  toggle(key: 'showRealName' | 'hideFromLeaderboard'): void {
    const me = this.auth.me();
    if (me) void this.auth.update({ [key]: !me[key] }).catch(() => this.toast.show(this.t.translate('review.errNetwork')));
  }

  async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
  }

  outside(e: Event): void {
    if (this.menuOpen() && !this.el.nativeElement.contains(e.target as Node)) this.menuOpen.set(false);
  }
}
