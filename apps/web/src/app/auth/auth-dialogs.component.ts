import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import type { ApiErrorBody } from '@kebabarium/shared';
import { ConfigStore } from '../core/config.store';
import { LangService, type Lang } from '../core/i18n';
import { IconComponent } from '../ui/icon.component';
import { ToastService } from '../ui/toast';
import { AuthUiStore } from './auth-ui.store';
import { AuthStore } from './auth.store';
import { renderGoogleButton } from './google-signin';

const NICK_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;

/** Sign-in sheet (Google button) and first-login nickname dialog, rendered once at the app root. */
@Component({
  selector: 'kb-auth-dialogs',
  imports: [IconComponent, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'ui.loginOpen.set(false)' },
  templateUrl: './auth-dialogs.component.html',
  styleUrl: './auth-dialogs.component.scss',
})
export class AuthDialogsComponent {
  readonly ui = inject(AuthUiStore);
  protected readonly auth = inject(AuthStore);
  protected readonly langs = inject(LangService);
  private readonly cfg = inject(ConfigStore);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);

  readonly nick = signal('');
  readonly nickError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly clientId = computed(() => this.cfg.config()?.googleClientId ?? null);
  private readonly gisEl = viewChild<ElementRef<HTMLElement>>('gis');

  constructor() {
    effect(() => {
      const el = this.gisEl()?.nativeElement;
      const id = this.clientId();
      if (el && id && this.ui.loginOpen()) {
        untracked(() =>
          void renderGoogleButton(el, id, this.langs.current(), (jwt) => this.onCredential(jwt)).catch(() =>
            this.toast.show(this.t.translate('review.errNetwork')),
          ),
        );
      }
    });
  }

  onCredential(jwt: string): void {
    this.busy.set(true);
    this.auth.login(jwt).then(
      (res) => {
        this.busy.set(false);
        this.ui.loginOpen.set(false);
        if (res.needsNickname) {
          this.ui.suggested.set(res.suggestedNickname ?? '');
          this.nick.set(res.suggestedNickname ?? '');
          this.ui.nicknameOpen.set(true);
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
        this.ui.nicknameOpen.set(false);
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
}
