import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

const GENERIC = /\b(шаурма|шаверма|кебаб|донер|doner|kebab|shawarma|на|біля|у|в)\b/giu;
const GRADIENTS = [
  'linear-gradient(135deg,#ffb347,#ff5a00)',
  'linear-gradient(135deg,#ff6a88,#c3002f)',
  'linear-gradient(135deg,#5ad1ff,#2a5bff)',
  'linear-gradient(135deg,#7dff9a,#0a8f3c)',
  'linear-gradient(135deg,#d6a3ff,#6a2bff)',
];

/** Up to two initials of the brand part of a name ("Кебаб-Шеф Сихів" → "ШС"). */
export function monogram(name: string): string {
  const words = name
    .replace(/(?<![\p{L}])(шаурма|шаверма|кебаб|донер|doner|kebab|shawarma|на|біля|у|в)(?![\p{L}])/giu, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || name.trim()[0]?.toUpperCase()) ?? 'K';
}

@Component({
  selector: 'kb-logo-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url() && !broken()) {
      <img [src]="url()" alt="" (error)="broken.set(true)" />
    } @else {
      <span class="logo" [style.background]="bg()" [class.dead]="dead()">{{ initials() }}</span>
    }
  `,
  styles: `
    :host { display: inline-flex; flex: none; }
    img, .logo { width: var(--s, 48px); height: var(--s, 48px); border-radius: 14px; object-fit: cover; }
    .logo { display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; font-size: 15px; color: #fff; }
    .dead { filter: grayscale(1) brightness(.6); }
  `,
})
export class LogoTileComponent {
  readonly id = input(0);
  readonly name = input.required<string>();
  readonly url = input<string | null>(null);
  readonly dead = input(false);
  readonly broken = signal(false);
  readonly initials = computed(() => monogram(this.name()));
  readonly bg = computed(() => GRADIENTS[this.id() % GRADIENTS.length]);
}
