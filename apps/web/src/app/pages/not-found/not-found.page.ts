import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'kb-not-found',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page glass" *transloco="let t">
      <h1>{{ t('notFound.title') }}</h1>
      <a class="chip acc" routerLink="/">{{ t('notFound.back') }}</a>
    </main>
  `,
  styles: `
    .page { max-width: 420px; margin: 18vh auto 0; padding: 28px; border-radius: 24px; text-align: center; }
    h1 { font-family: var(--font-display); font-size: 20px; margin: 0 0 18px; }
  `,
})
export class NotFoundPage {}
