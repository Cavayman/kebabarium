import { Injectable, signal } from '@angular/core';

/** The boot screen plays once per full page load, never on in-app navigation. */
@Injectable({ providedIn: 'root' })
export class BootState {
  readonly shown = signal(false);
}
