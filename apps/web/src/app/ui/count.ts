import type { TranslocoService } from '@jsverse/transloco';
import { asTimeLang } from './time';

/** "2 096" in the app language (thin grouping as Intl gives it). */
export function formatCount(t: TranslocoService, n: number): string {
  return n.toLocaleString(asTimeLang(t.getActiveLang()));
}

/** "1 відгук" / "3 відгуки" / "219 відгуків" / "ще без відгуків", using the language's plural rules. */
export function reviewsText(t: TranslocoService, n: number): string {
  if (!n || n <= 0) return t.translate('reviews.none');
  const lang = asTimeLang(t.getActiveLang());
  return t.translate(`reviews.${new Intl.PluralRules(lang).select(n)}`, { n: n.toLocaleString(lang) });
}
