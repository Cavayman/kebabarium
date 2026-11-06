import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { ChainsTab } from './chains.tab';
import { ModerationTab } from './moderation.tab';
import { PlacesTab } from './places.tab';
import { SyncTab } from './sync.tab';

type Tab = 'places' | 'chains' | 'moderation' | 'sync';

@Component({
  selector: 'kb-admin',
  imports: [RouterLink, TranslocoDirective, PlacesTab, ChainsTab, ModerationTab, SyncTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap" *transloco="let t">
      <header class="top">
        <a class="chip glass" routerLink="/">← {{ t('notFound.back') }}</a>
        <h1>{{ t('admin.title') }}</h1>
      </header>
      <nav class="seg">
        @for (x of tabs; track x) {
          <button type="button" [class.on]="tab() === x" (click)="tab.set(x)">{{ t('admin.' + x) }}</button>
        }
      </nav>
      <section class="glass box">
        @switch (tab()) {
          @case ('places') { <kb-admin-places /> }
          @case ('chains') { <kb-admin-chains /> }
          @case ('moderation') { <kb-admin-moderation /> }
          @case ('sync') { <kb-admin-sync /> }
        }
      </section>
    </main>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 16px 12px 48px; display: flex; flex-direction: column; gap: 12px; }
    .top { display: flex; align-items: center; gap: 12px; }
    h1 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 600; }
    .seg { max-width: 520px; }
    .box { padding: 14px; border-radius: var(--radius); }
  `,
})
export class AdminPage {
  readonly tabs: Tab[] = ['places', 'chains', 'moderation', 'sync'];
  readonly tab = signal<Tab>('moderation');
}
