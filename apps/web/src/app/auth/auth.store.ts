import { computed, inject, Injectable, signal } from '@angular/core';
import type { LoginResponse, Me } from '@kebabarium/shared';
import { firstValueFrom } from 'rxjs';
import { ApiService, type MePatch } from '../core/api.service';
import { LangService } from '../core/i18n';

/** Current user (null = anonymous visitor). */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiService);
  private readonly lang = inject(LangService);
  readonly me = signal<Me | null>(null);
  readonly loaded = signal(false);
  readonly isAdmin = computed(() => this.me()?.role === 'admin');

  load(): void {
    this.api.me().subscribe({
      next: (me) => {
        this.set(me);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  async login(credential: string): Promise<LoginResponse> {
    const res = await firstValueFrom(this.api.login(credential));
    this.set(res.me);
    return res;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.api.logout()).catch(() => undefined);
    this.me.set(null);
  }

  async update(patch: MePatch): Promise<Me> {
    const me = await firstValueFrom(this.api.updateMe(patch));
    this.me.set(me);
    return me;
  }

  private set(me: Me | null): void {
    this.me.set(me);
    if (me?.lang && me.lang !== this.lang.current()) this.lang.set(me.lang);
  }
}
