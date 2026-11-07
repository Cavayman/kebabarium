import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ratingColor, type City } from '@kebabarium/shared';
import { ApiService, type AdminChain, type AdminPlace, type AdminPlaceSort } from '../core/api.service';
import { formatCount } from '../ui/count';
import { asTimeLang, reviewTime } from '../ui/time';

type Status = AdminPlace['status'];
const PAGE = 50;

@Component({
  selector: 'kb-admin-places',
  imports: [TranslocoDirective, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <div class="tools">
        <input class="field" [placeholder]="t('admin.search')" [value]="q()" (input)="q.set($any($event.target).value)" (keyup.enter)="reload()" />
        <select class="field" [value]="status()" (change)="status.set($any($event.target).value); reload()">
          <option value="">{{ t('admin.status') }}: {{ t('admin.all') }}</option>
          @for (s of statuses; track s) {<option [value]="s">{{ s }}</option>}
        </select>
        <select class="field" data-sort [value]="sort()" (change)="sort.set($any($event.target).value); reload()">
          @for (s of sorts; track s) {<option [value]="s">{{ t('admin.sortBy') }}: {{ t('admin.sort.' + s) }}</option>}
        </select>
        <label class="muted"><input type="checkbox" [checked]="candidates()" (change)="candidates.set(!candidates()); reload()" /> {{ t('admin.deadCandidates') }}</label>
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
          <thead>
            <tr>
              <th>#</th><th>{{ t('admin.col.name') }}</th><th>Google</th><th>{{ t('admin.col.chain') }}</th><th>{{ t('admin.col.district') }}</th>
              <th>{{ t('admin.col.logo') }}</th><th>{{ t('admin.status') }}</th><th>{{ t('admin.col.seen') }}</th><th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of items(); track p.id) {
              <tr [class.off]="p.status === 'hidden'">
                <td class="muted">{{ p.id }}</td>
                <td><input class="field" [value]="p.name" (change)="patch(p, { name: $any($event.target).value })" /></td>
                <td class="g">
                  @if (p.googleRating != null) {
                    <span class="gs" [style.background]="color(p.googleRating)">{{ p.googleRating.toFixed(1) }}</span>
                    <span class="muted">{{ count(p.googleRatingCount ?? 0) }}</span>
                  } @else {
                    <span class="muted">—</span>
                  }
                </td>
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
                <td class="muted nowrap">{{ when(p.lastSeenAt) }}</td>
                <td class="acts">
                  @if (p.status === 'hidden') {
                    <button type="button" class="chip sm" [attr.data-show]="p.id" (click)="patch(p, { status: 'open' })">{{ t('admin.unhide') }}</button>
                  } @else {
                    <button type="button" class="chip sm" [attr.data-hide]="p.id" [attr.title]="t('admin.hideHint')" (click)="patch(p, { status: 'hidden' })">{{ t('admin.hide') }}</button>
                  }
                  @if (p.deadCandidate) {<button type="button" class="chip sm" (click)="patch(p, { deadCandidate: false })">✓ ok</button>}
                  <a class="chip sm" [routerLink]="['/', city().slug, 'place', p.id]" target="_blank">{{ t('admin.onSite') }}</a>
                  @if (p.googlePlaceId) {
                    <a class="chip sm" data-gmaps [href]="'https://www.google.com/maps/place/?q=place_id:' + p.googlePlaceId" target="_blank" rel="noopener noreferrer">Google ↗</a>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="9" class="muted">{{ t('admin.empty') }}</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div class="pager">
        <button type="button" class="chip sm" data-prev [disabled]="page() <= 1" (click)="go(page() - 1)">←</button>
        <span class="muted" data-pages>{{ page() }} / {{ pages() }}</span>
        <button type="button" class="chip sm" data-next [disabled]="page() >= pages()" (click)="go(page() + 1)">→</button>
      </div>
    </ng-container>
  `,
  styleUrl: './admin.scss',
  styles: `
    td:nth-child(2) .field { min-width: 200px; }
    .g { white-space: nowrap; }
    .gs { display: inline-block; min-width: 30px; text-align: center; padding: 2px 6px; margin-right: 6px; border-radius: 7px; font-weight: 800; font-size: 12px; color: #111; }
    .acts { display: flex; flex-wrap: wrap; gap: 4px; }
    .acts a { text-decoration: none; }
    .nowrap { white-space: nowrap; }
    tr.off td { opacity: .55; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 10px; margin-top: 12px; }
  `,
})
export class PlacesTab {
  readonly city = input.required<City>();
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  readonly statuses: Status[] = ['open', 'closed_temp', 'dead', 'hidden'];
  readonly sorts: AdminPlaceSort[] = ['name', 'rating', 'reviews', 'newest', 'seen'];
  readonly items = signal<AdminPlace[]>([]);
  readonly chains = signal<AdminChain[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE)));
  readonly q = signal('');
  readonly status = signal('');
  readonly sort = signal<AdminPlaceSort>('name');
  readonly candidates = signal(false);
  readonly moveFrom = signal(0);
  readonly moveTo = signal(0);

  constructor() {
    effect(() => {
      const slug = this.city().slug;
      untracked(() => {
        this.page.set(1);
        this.load();
        this.api.admin.chains(slug).subscribe((c) => this.chains.set(c));
      });
    });
  }

  reload(): void {
    this.page.set(1);
    this.load();
  }

  go(page: number): void {
    this.page.set(Math.min(this.pages(), Math.max(1, page)));
    this.load();
  }

  load(): void {
    this.api.admin
      .places({
        city: this.city().slug,
        q: this.q() || undefined,
        status: this.status() || undefined,
        deadCandidate: this.candidates() ? 1 : undefined,
        sort: this.sort(),
        page: this.page(),
      })
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

  color(v: number): string {
    return ratingColor(v);
  }
  count(n: number): string {
    return formatCount(this.t, n);
  }
  when(iso: string | null): string {
    return iso ? reviewTime(iso, asTimeLang(this.t.getActiveLang())).short : '—';
  }
}
