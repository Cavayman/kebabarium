import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import type { City } from '@kebabarium/shared';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiService, type AdminChain } from '../core/api.service';

@Component({
  selector: 'kb-admin-chains',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <div class="tools">
        <input class="field" [placeholder]="t('admin.newChain')" [value]="name()" (input)="name.set($any($event.target).value)" (keyup.enter)="create()" />
        <button type="button" class="chip sm acc" [disabled]="!name().trim()" (click)="create()">+</button>
      </div>
      <table>
        <thead><tr><th>Назва</th><th>Лого URL</th><th>Точок</th><th></th></tr></thead>
        <tbody>
          @for (c of items(); track c.id) {
            <tr>
              <td><input class="field" [value]="c.name" (change)="patch(c, { name: $any($event.target).value })" /></td>
              <td><input class="field" [value]="c.logoUrl ?? ''" placeholder="https://…" (change)="patch(c, { logoUrl: $any($event.target).value || null })" /></td>
              <td class="muted">{{ c.spots ?? 0 }}</td>
              <td><button type="button" class="chip sm danger" (click)="remove(c)">✕</button></td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="muted">{{ t('admin.empty') }}</td></tr>
          }
        </tbody>
      </table>
    </ng-container>
  `,
  styleUrl: './admin.scss',
})
export class ChainsTab {
  readonly city = input.required<City>();
  private readonly api = inject(ApiService);
  readonly items = signal<AdminChain[]>([]);
  readonly name = signal('');

  constructor() {
    effect(() => {
      this.city();
      untracked(() => this.load());
    });
  }

  load(): void {
    this.api.admin.chains(this.city().slug).subscribe((c) => this.items.set(c));
  }

  create(): void {
    const name = this.name().trim();
    if (!name) return;
    this.api.admin.createChain({ name, cityId: this.city().id }).subscribe(() => {
      this.name.set('');
      this.load();
    });
  }

  patch(c: AdminChain, b: { name?: string; logoUrl?: string | null }): void {
    this.api.admin.patchChain(c.id, b).subscribe(() => this.load());
  }

  remove(c: AdminChain): void {
    if (confirm(`${c.name}?`)) this.api.admin.deleteChain(c.id).subscribe(() => this.load());
  }
}
