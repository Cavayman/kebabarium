import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiService, type AdminBan, type AdminReview } from '../core/api.service';

type BanKind = 'ip_prefix' | 'device' | 'user';

/** Pending/held queue + bans. Identity hints are 8-char hash prefixes — never IP addresses. */
@Component({
  selector: 'kb-admin-moderation',
  imports: [TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      <div class="tools">
        <div class="seg">
          <button type="button" [class.on]="status() === 'held'" (click)="status.set('held'); load()">{{ t('admin.held') }}</button>
          <button type="button" [class.on]="status() === 'pending'" (click)="status.set('pending'); load()">{{ t('admin.pending') }}</button>
        </div>
      </div>
      @for (r of items(); track r.id) {
        <div class="card rv">
          <div><b>{{ r.placeName }}</b> · {{ '★'.repeat(r.stars) }} · <span class="muted">{{ r.createdAt.slice(0, 16).replace('T', ' ') }}</span></div>
          @if (r.text) {<p>{{ r.text }}</p>}
          <div class="muted">
            {{ r.userNickname ?? r.nickname ?? (r.anonymous ? 'анонім' : '') }}
            · net {{ r.identity.network }} · ip {{ r.identity.ip }} · dev {{ r.identity.device }}
            @for (why of r.reasons; track why) {<span class="pill cand">{{ why }}</span>}
          </div>
          <div class="act" style="margin-top: 8px">
            <button type="button" class="chip sm acc" [attr.data-approve]="r.id" (click)="approve(r)">{{ t('admin.approve') }}</button>
            <button type="button" class="chip sm" (click)="hide(r)">{{ t('admin.hide') }}</button>
            <button type="button" class="chip sm danger" (click)="hideAll(r)">{{ t('admin.hideAll') }}</button>
            <select class="field" style="width: auto" #kind><option value="device">device</option><option value="ip_prefix">network</option>@if (r.userId) {<option value="user">user</option>}</select>
            <select class="field" style="width: auto" #days><option value="7">7d</option><option value="30">30d</option><option value="0">∞</option></select>
            <button type="button" class="chip sm danger" (click)="ban(r, $any(kind.value), +days.value)">{{ t('admin.ban') }}</button>
          </div>
        </div>
      } @empty {
        <p class="muted">{{ t('admin.empty') }}</p>
      }

      <h3>{{ t('admin.bans') }}</h3>
      <table>
        <tbody>
          @for (b of bans(); track b.id) {
            <tr>
              <td>{{ b.kind }}</td><td class="muted">{{ b.value }}</td><td>{{ b.reason }}</td><td class="muted">{{ b.until?.slice(0, 10) ?? '∞' }}</td>
              <td><button type="button" class="chip sm" (click)="unban(b)">{{ t('admin.unban') }}</button></td>
            </tr>
          } @empty {
            <tr><td class="muted">{{ t('admin.empty') }}</td></tr>
          }
        </tbody>
      </table>
    </ng-container>
  `,
  styleUrl: './admin.scss',
  styles: `h3 { font-family: var(--font-display); font-size: 14px; font-weight: 600; margin: 18px 0 6px; } .rv p { margin: 6px 0; overflow-wrap: anywhere; }`,
})
export class ModerationTab {
  private readonly api = inject(ApiService);
  readonly status = signal<'held' | 'pending'>('held');
  readonly items = signal<AdminReview[]>([]);
  readonly bans = signal<AdminBan[]>([]);

  constructor() {
    this.load();
    this.loadBans();
  }

  load(): void {
    this.api.admin.reviews(this.status()).subscribe((r) => this.items.set(r.items));
  }

  loadBans(): void {
    this.api.admin.bans().subscribe((b) => this.bans.set(b));
  }

  private drop(id: number): void {
    this.items.update((all) => all.filter((x) => x.id !== id));
  }

  approve(r: AdminReview): void {
    this.api.admin.approve(r.id).subscribe(() => this.drop(r.id));
  }

  hide(r: AdminReview): void {
    this.api.admin.hide(r.id).subscribe(() => this.drop(r.id));
  }

  hideAll(r: AdminReview): void {
    this.api.admin.hideIdentity(r.id).subscribe(() => this.load());
  }

  ban(r: AdminReview, kind: BanKind, days: number): void {
    this.api.admin.ban({ ratingId: r.id, kind, days: days || null, reason: r.reasons.join(',') || 'manual' }).subscribe(() => this.loadBans());
  }

  unban(b: AdminBan): void {
    this.api.admin.unban(b.id).subscribe(() => this.loadBans());
  }
}
