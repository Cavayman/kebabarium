const LINK = /(https?:\/\/|www\.|\b[\w-]+\.(com|net|org|ua|ru|io|me|info|xyz|top|link|shop)\b)/i;

/** Roots of slurs/obscenities (uk/ru/en); a hit sends the review to moderation, it is not rejected. */
const PROFANITY = [
  'хуй', 'хуя', 'хує', 'пизд', 'їба', 'єба', 'ебан', 'ебат', 'уєб', 'уеб', 'бляд', 'блять', 'сука', 'сучк', 'мудак', 'мудил',
  'підар', 'підор', 'пидор', 'пидар', 'гандон', 'залуп', 'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'retard',
];

export type ContentFlag = 'link' | 'profanity';

export function contentFlags(...texts: Array<string | null | undefined>): ContentFlag[] {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  const flags: ContentFlag[] = [];
  if (LINK.test(t)) flags.push('link');
  if (PROFANITY.some((w) => t.includes(w))) flags.push('profanity');
  return flags;
}
