import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router, type CanMatchFn } from '@angular/router';
import { filter, map, take } from 'rxjs';
import { AuthStore } from './auth.store';

function whenLoaded(check: (s: AuthStore) => boolean): CanMatchFn {
  return () => {
    const auth = inject(AuthStore);
    const router = inject(Router);
    return toObservable(auth.loaded).pipe(
      filter(Boolean),
      take(1),
      map(() => (check(auth) ? true : router.parseUrl('/'))),
    );
  };
}

export const authGuard = whenLoaded((s) => s.me() != null);
/** UX only — every admin endpoint is enforced server-side. */
export const adminGuard = whenLoaded((s) => s.isAdmin());
