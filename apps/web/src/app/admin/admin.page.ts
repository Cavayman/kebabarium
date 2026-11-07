import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ConfigStore } from '../core/config.store';
import { ChainsTab } from './chains.tab';
import { ModerationTab } from './moderation.tab';
import { OverviewTab, type AdminTab } from './overview.tab';
import { PlacesTab } from './places.tab';
import { SyncTab } from './sync.tab';

const CITY_KEY = 'kb.admin.city';

@Component({
  selector: 'kb-admin',
  imports: [RouterLink, TranslocoDirective, OverviewTab, PlacesTab, ChainsTab, ModerationTab, SyncTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" *transloco="let t">
      <header class="top">
        <a class="chip glass" routerLink="/">← {{ t('notFound.back') }}</a>
        <h1>{{ t('admin.title') }}</h1>
        @if (cfg.cities().length) {
          <label class="city">
            <span class="muted">{{ t('nav.city') }}</span>
            <select class="field" data-city [value]="city()?.slug" (change)="pickCity($any($event.target).value)">
              @for (c of cfg.cities(); track c.id) {
                <option [value]="c.slug">{{ c.name }} · {{ c.spots }}</option>
              }
            </select>
          </label>
        }
      </header>
      <nav class="seg">
        @for (x of tabs; track x) {
          <button type="button" [attr.data-tab]="x" [class.on]="tab() === x" (click)="tab.set(x)">{{ t('admin.' + x) }}</button>
        }
      </nav>
      <section class="glass box">
        @if (city(); as c) {
          @switch (tab()) {
            @case ('overview') { <kb-admin-overview [city]="c" (open)="tab.set($event)" /> }
            @case ('places') { <kb-admin-places [city]="c" /> }
            @case ('chains') { <kb-admin-chains [city]="c" /> }
            @case ('moderation') { <kb-admin-moderation [city]="c" /> }
            @case ('sync') { <kb-admin-sync [city]="c" /> }
          }
        }
      </section>
    </main>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .wrap { max-width: 1180px; margin: 0 auto; padding: 16px 12px 48px; display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
    h1 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
    .city { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .city .field { width: auto; }
    .seg { max-width: 640px; }
    .box { padding: 14px; border-radius: var(--radius); }
  `,
})
export class AdminPage {
  protected readonly cfg = inject(ConfigStore);
  readonly tabs: AdminTab[] = ['overview', 'places', 'chains', 'moderation', 'sync'];
  readonly tab = signal<AdminTab>('overview');
  private readonly slug = signal<string | null>(readCity());
  readonly city = computed(() => {
    const cities = this.cfg.cities();
    return cities.find((c) => c.slug === this.slug()) ?? cities[0] ?? null;
  });

  constructor() {
    void this.cfg.load();
  }

  pickCity(slug: string): void {
    this.slug.set(slug);
    try {
      localStorage.setItem(CITY_KEY, slug);
    } catch {
      /* private mode */
    }
  }
}

function readCity(): string | null {
  try {
    return localStorage.getItem(CITY_KEY);
  } catch {
    return null;
  }
}
