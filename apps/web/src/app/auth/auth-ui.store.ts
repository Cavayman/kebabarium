import { Injectable, signal } from '@angular/core';

/**
 * Open/closed state of the sign-in sheet and nickname dialog. The dialogs render at the app root:
 * inside the navbar they'd be trapped by its transform/backdrop-filter (fixed positioning breaks).
 */
@Injectable({ providedIn: 'root' })
export class AuthUiStore {
  readonly loginOpen = signal(false);
  readonly nicknameOpen = signal(false);
  readonly suggested = signal('');
}
