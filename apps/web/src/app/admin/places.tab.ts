import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiService, type AdminChain, type AdminPlace } from '../core/api.service';

type Status = AdminPlace['status'];

@Component({
  selector: 'kb-admin-places',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <div class="tools">
        <input class="field" [placeholder]="t('admin.search')" [value]="q()" (input)="q.set($any($event.target).value)" (keyup.enter)="load()" />
        <select class="field" [value]="status()" (change)="status.set($any($event.target).value); load()">
          <option value="">{{ t('admin.status') }}: {{ t('admin.all') }}</option>
          <option value="open">open</option><option value="closed_temp">closed_temp</option><option value="dead">dead</option><option value="hidden">hidden</option>
        </select>
        <label class="muted"><input type="checkbox" [checked]="candidates()" (change)="candidates.set(!candidates()); load()" /> {{ t('admin.deadCandidates') }}</label>
        <span class="muted">{{ total() }}</span>
      </div>

      <div class="card">
        <b>{{ t('admin.movedTo') }}</b>
        <div class="tools" style="margin: 8px 0 0">
          <select class="field" (change)="moveFrom.set(+$any($event.target).value)"><option value="0">—</option>@for (p of items(); track p.id) {<option [value]="p.id">{{ p.name }}</option>}</select>
          →
          <select class="field" (change)="moveTo.set(+$any($event.target).value)"><option value="0">—</option>@for (p of items(); track p.id) {<option [value]="p.id">{{ p.name }}</option>}</select>
          <button type="button" class="chip sm acc" [disabled]="!moveFrom() || !moveTo() || moveFrom() === moveTo()" (click)="doMove()">OK</button>
        </div>
      </div>

      <div class="scroll">
        <table>
          <thead><tr><th>#</th><th>Назва</th><th>Мережа</th><th>Район</th><th>Лого URL</th><th>{{ t('admin.status') }}</th><th></th></tr></thead>
          <tbody>
            @for (p of items(); track p.id) {
              <tr>
                <td class="muted">{{ p.id }}</td>
                <td><input class="field" [value]="p.name" (change)="patch(p, { name: $any($event.target).value })" /></td>
                <td>
                  <select class="field" [value]="p.chainId ?? ''" (change)="patch(p, { chainId: $any($event.target).value ? +$any($event.target).value : null })">
                    <option value="">—</option>
                    @for (c of chains(); track c.id) {<option [value]="c.id">{{ c.name }}</option>}
                  </select>
                </td>
                <td><input class="field" [value]="p.district ?? ''" (change)="patch(p, { district: $any($event.target).value || null })" /></td>
                <td><input class="field" [value]="p.logoUrl ?? ''" placeholder="https://…" (change)="patch(p, { logoUrl: $any($event.target).value || null })" /></td>
                <td>
                  <select class="field" [value]="p.status" (change)="patch(p, { status: $any($event.target).value })">
                    @for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}
                  </select>
                  @if (p.deadCandidate) {<span class="pill cand">?</span>}
                  @if (p.deadReason) {<span class="pill dead">{{ p.deadReason }}</span>}
                </td>
                <td>@if (p.deadCandidate) {<button type="button" class="chip sm" (click)="patch(p, { deadCandidate: false })">✓ ok</button>}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="muted">{{ t('admin.empty') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </ng-container>
  `,
  styleUrl: './admin.scss',
})
export class PlacesTab {
  private readonly api = inject(ApiService);
  readonly statuses: Status[] = ['open', 'closed_temp', 'dead', 'hidden'];
  readonly items = signal<AdminPlace[]>([]);
  readonly chains = signal<AdminChain[]>([]);
  readonly total = signal(0);
  readonly q = signal('');
  readonly status = signal('');
  readonly candidates = signal(false);
  readonly moveFrom = signal(0);
  readonly moveTo = signal(0);

  constructor() {
    this.load();
    this.api.admin.chains().subscribe((c) => this.chains.set(c));
  }

  load(): void {
    this.api.admin
      .places({ city: 'lviv', q: this.q() || undefined, status: this.status() || undefined, deadCandidate: this.candidates() ? 1 : undefined })
      .subscribe((r) => {
        this.items.set(r.items);
        this.total.set(r.total);
      });
  }

  patch(p: AdminPlace, change: Parameters<ApiService['admin']['patchPlace']>[1]): void {
    this.api.admin.patchPlace(p.id, change).subscribe((u) => this.items.update((all) => all.map((x) => (x.id === u.id ? u : x))));
  }

  doMove(): void {
    if (!this.moveFrom() || !this.moveTo() || this.moveFrom() === this.moveTo()) return;
    this.api.admin.moveTo(this.moveFrom(), this.moveTo()).subscribe(() => {
      this.moveFrom.set(0);
      this.moveTo.set(0);
      this.load();
    });
  }
}
