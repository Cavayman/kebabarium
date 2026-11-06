import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { LangService, type Lang } from '../core/i18n';
import { IconComponent } from '../ui/icon.component';
import { ToastService } from '../ui/toast';
import { AuthStore } from './auth.store';
import { AuthUiStore } from './auth-ui.store';

const NICK_RE = /^[\p{L}\p{N}_.-]{3,24}$/u;

/** Navbar end: "Увійти" (opens the root-level sign-in sheet) or the avatar with the profile menu. */
@Component({
  selector: 'kb-account',
  imports: [IconComponent, RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'outside($event)', '(document:keydown.escape)': 'menuOpen.set(false)' },
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly langs = inject(LangService);
  private readonly t = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly menuOpen = signal(false);
  readonly ui = inject(AuthUiStore);
  readonly initial = computed(() => (this.auth.me()?.displayName.trim()[0] ?? '?').toUpperCase());

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
