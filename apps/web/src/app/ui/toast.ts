import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, ms = 3500): void {
    clearTimeout(this.timer);
    this.message.set(text);
    this.timer = setTimeout(() => this.message.set(null), ms);
  }
}

@Component({
  selector: 'kb-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (toast.message(); as m) {<div class="toast glass" role="status">{{ m }}</div>}`,
  styles: `
    :host { position: fixed; left: 50%; top: 70px; transform: translateX(-50%); z-index: 60; pointer-events: none; }
    .toast { padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 700; animation: kb-pop .25s; white-space: nowrap; max-width: 92vw; overflow: hidden; text-overflow: ellipsis; }
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
