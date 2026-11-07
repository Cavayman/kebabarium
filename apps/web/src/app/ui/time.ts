/**
 * When a review was written, in the reader's time zone:
 * today → "14:32", yesterday → "учора, 14:32", this year → "6 лист., 14:32", older → "6 лист. 2024 р.".
 * `full` is the long form for a tooltip ("6 листопада 2026 р. о 14:32").
 */
export function reviewTime(iso: string, lang: 'uk' | 'en', now = new Date()): { short: string; full: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { short: '', full: '' };
  const clock = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  const full = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23' }).format(d);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(d)) / 86400e3);

  let short: string;
  if (daysAgo <= 0) short = clock;
  else if (daysAgo === 1) short = `${new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-1, 'day')}, ${clock}`;
  else if (d.getFullYear() === now.getFullYear()) short = `${new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(d)}, ${clock}`;
  else short = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return { short, full };
}

/** The page language as used by the time formats. */
export const pageLang = (): 'uk' | 'en' => (document.documentElement.lang === 'en' ? 'en' : 'uk');
