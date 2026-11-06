import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { CityStats } from '@kebabarium/shared';
import { BOOT_HARD_MAX_MS, bootEnd, bootFrame, bootTimeline, holdPoint, type BootLine } from './boot-timeline';

const FADE_MS = 600;
const BAR_CELLS = 20;

@Component({
  selector: 'kb-boot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="boot" [class.out]="leaving()" (click)="finish()" role="status" aria-live="polite">
      <div class="term">
        <div class="hd"><i></i><i></i><i></i><span>kebabarium — zsh</span></div>
        <div class="bd">
          @for (l of lines(); track $index) {
            @switch (l.kind) {
              @case ('cmd') {
                <div><span class="d">~/{{ city() }}</span>{{ ' ' }}<span class="p">$</span>{{ ' ' + l.text }}@if (l.caret) {<span class="caret"></span>}</div>
              }
              @case ('step') {
                <div class="ln"><span class="lbl"><span class="p">›</span> {{ l.text }}</span><span class="dots"></span>
                  @if (l.spinning) {<span class="p">{{ l.value }}</span>} @else {<span class="v">{{ l.value }}</span>{{ ' ' }}<span class="ok">✓</span>}
                </div>
              }
              @case ('bar') {
                <div class="ln"><span class="lbl"><span class="p">›</span> {{ l.text }}&nbsp;</span><span class="p">[{{ bar(l.percent!).on }}<span class="e">{{ bar(l.percent!).off }}</span>] {{ l.percent }}%</span></div>
              }
              @case ('ready') {
                <div class="ready">{{ l.text }}<span class="caret"></span></div>
              }
            }
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: './boot-screen.component.scss',
})
export class BootScreenComponent {
  readonly stats = input<CityStats | null>(null);
  readonly ready = input(false);
  readonly city = input('lviv');
  readonly done = output<void>();

  readonly lines = signal<BootLine[]>([]);
  readonly leaving = signal(false);
  private readonly t = inject(TranslocoService);
  private frame = 0;
  private finished = false;

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => cancelAnimationFrame(this.frame));
    afterNextRender(() => this.run());
  }

  private run(): void {
    const steps = bootTimeline(this.city(), this.t.translate('boot.ready'));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.lines.set(bootFrame(steps, bootEnd(steps), this.stats()).lines);
      setTimeout(() => this.finish(), FADE_MS);
      return;
    }
    const hold = holdPoint(steps);
    const started = performance.now();
    let last = started;
    let clock = 0;
    const tick = () => {
      const now = performance.now();
      clock += Math.min(now - last, 1000);
      last = now;
      if (!this.ready() && clock > hold) clock = hold;
      const f = bootFrame(steps, clock, this.stats());
      this.lines.set(f.lines);
      if (f.finished || now - started >= BOOT_HARD_MAX_MS) return this.finish();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
    // hard cap even if rAF is throttled (background tab)
    setTimeout(() => this.finish(), BOOT_HARD_MAX_MS);
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.frame);
    this.leaving.set(true);
    setTimeout(() => this.done.emit(), FADE_MS);
  }

  bar(percent: number): { on: string; off: string } {
    const n = Math.round((percent / 100) * BAR_CELLS);
    return { on: '█'.repeat(n), off: '░'.repeat(BAR_CELLS - n) };
  }
}
