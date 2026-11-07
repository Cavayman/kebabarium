import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import type { City } from '@kebabarium/shared';
import { TranslocoDirective } from '@jsverse/transloco';
import { ApiService, type AdminBan, type AdminChatMessage, type AdminReview } from '../core/api.service';

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

      @if (city(); as c) {
        <h3>{{ t('admin.chatTitle') }} · {{ c.name }}</h3>
        <div class="chatlog">
          @for (m of chat(); track m.id) {
            <div class="cl" [class.gone]="m.status === 'hidden'">
              <span class="muted">{{ m.createdAt.slice(5, 16).replace('T', ' ') }}</span>
              <b>{{ m.author ?? '#' + m.userId }}</b>
              <span class="tx">{{ m.text }}</span>
              @if (m.status === 'hidden') {
                <span class="pill dead">{{ t('admin.chatHidden') }}</span>
              } @else {
                <button type="button" class="chip sm" [attr.data-hide-chat]="m.id" (click)="hideChat(m)">{{ t('admin.chatHide') }}</button>
              }
            </div>
          } @empty {
            <p class="muted">{{ t('admin.empty') }}</p>
          }
        </div>
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
  styles: `
    h3 { font-family: var(--font-display); font-size: 14px; font-weight: 600; margin: 18px 0 6px; }
    .rv p { margin: 6px 0; overflow-wrap: anywhere; }
    .chatlog { max-height: 340px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
    .cl { display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,.03); font-size: 12.5px; }
    .cl .tx { overflow-wrap: anywhere; }
    .cl.gone { opacity: .5; }
  `,
})
export class ModerationTab {
  /** Optional so the queue works without a city; the chat log needs one. */
  readonly city = input<City | null>(null);
  private readonly api = inject(ApiService);
  readonly status = signal<'held' | 'pending'>('held');
  readonly items = signal<AdminReview[]>([]);
  readonly bans = signal<AdminBan[]>([]);
  readonly chat = signal<AdminChatMessage[]>([]);

  constructor() {
    this.load();
    this.loadBans();
    effect(() => {
      const c = this.city();
      if (c) untracked(() => this.api.admin.chat(c.slug).subscribe((m) => this.chat.set(m)));
    });
  }

  hideChat(m: AdminChatMessage): void {
    this.api.admin.hideChat(m.id).subscribe(() => this.chat.update((all) => all.map((x) => (x.id === m.id ? { ...x, status: 'hidden' } : x))));
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
