import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** Thin line icons (UI chrome never uses emoji — spec §5). Static, trusted SVG strings. */
const PATHS = {
  pin: '<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  nav: '<path d="M3 11l18-8-8 18-2-8-8-2z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 6h3a3 3 0 0 1-3 3M7 6H4a3 3 0 0 0 3 3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  minus: '<path d="M6 12h12"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
} as const;

export type IconName = keyof typeof PATHS;

@Component({
  selector: 'kb-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [innerHTML]="svg()"></span>`,
  styles: `:host { display: inline-flex; line-height: 0; } span { display: inline-flex; }`,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(16);
  private readonly sanitizer = inject(DomSanitizer);
  readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      `<svg viewBox="0 0 24 24" width="${this.size()}" height="${this.size()}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[this.name()]}</svg>`,
    ),
  );
}

/** Orange rounded-square mark with three bars (logo). */
@Component({
  selector: 'kb-logo-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 32 32" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="9" fill="#ff7a00" />
    <rect x="9" y="17" width="3.2" height="7" rx="1.2" fill="#1a0a00" />
    <rect x="14.4" y="10" width="3.2" height="14" rx="1.2" fill="#1a0a00" />
    <rect x="19.8" y="14" width="3.2" height="10" rx="1.2" fill="#1a0a00" />
  </svg>`,
  styles: `:host { display: inline-flex; }`,
})
export class LogoMarkComponent {
  readonly size = input(22);
}
