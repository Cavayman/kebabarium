import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';

/** Required for Meta app review (Threads) and honest towards visitors. */
@Component({
  selector: 'kb-privacy',
  imports: [RouterLink, TranslocoDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './privacy.page.html',
  styleUrl: './privacy.page.scss',
})
export class PrivacyPage {
  readonly lang = toSignal(inject(TranslocoService).langChanges$, { initialValue: 'uk' });
  readonly updated = '2026-11-06';
}
