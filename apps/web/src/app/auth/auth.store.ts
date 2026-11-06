import { computed, inject, Injectable, signal } from '@angular/core';
import type { Me } from '@kebabarium/shared';
import { ApiService } from '../core/api.service';

/** Current user (null = anonymous visitor). Sign-in UI lives in the auth components. */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiService);
  readonly me = signal<Me | null>(null);
  readonly loaded = signal(false);
  readonly isAdmin = computed(() => this.me()?.role === 'admin');

  load(): void {
    this.api.me().subscribe({
      next: (me) => {
        this.me.set(me);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }
}
