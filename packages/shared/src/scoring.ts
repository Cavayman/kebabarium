export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const valid = (n: number | null | undefined): n is number => n != null && !Number.isNaN(n);

/** Weighted mean of published ratings (weight 1 logged-in, 0.5 anonymous). */
export function ourScore(rs: ReadonlyArray<{ stars: number; weight: number }>): number | null {
  let sum = 0;
  let w = 0;
  for (const r of rs) {
    sum += r.stars * r.weight;
    w += r.weight;
  }
  return w > 0 ? sum / w : null;
}

/** Mean of ours and Google when both exist, else whichever exists, else null. */
export function combinedScore(our: number | null, google: number | null): number | null {
  const a = valid(our) ? our : null;
  const b = valid(google) ? google : null;
  if (a != null && b != null) return Math.round(((a + b) / 2) * 1000) / 1000;
  return a ?? b;
}

/** Leaderboard ranking knobs. */
export const RANK = {
  /** A place's score is blended with the city average as if it had this many extra average reviews. */
  priorReviews: 30,
  /** No freshness penalty while the latest review is at most this old. */
  freshDays: 90,
  /** The penalty grows linearly until the latest review is this old… */
  staleDays: 730,
  /** …and is then capped at this many stars. */
  stalePenalty: 0.5,
} as const;

/**
 * Ranking key for the "best spots" list (the shown score stays the plain one):
 * a Bayesian average that needs many reviews to move far from the city average (`prior`),
 * minus a penalty when nobody has reviewed the place for a long time.
 */
export function rankScore(score: number, reviews: number, lastReviewAt: string | null, prior: number, now = new Date()): number {
  const n = Math.max(0, reviews);
  const bayes = (n * score + RANK.priorReviews * prior) / (n + RANK.priorReviews);
  const last = lastReviewAt ? Date.parse(lastReviewAt) : NaN;
  const days = Number.isNaN(last) ? Infinity : (now.getTime() - last) / 86400e3;
  const stale = Math.min(1, Math.max(0, (days - RANK.freshDays) / (RANK.staleDays - RANK.freshDays)));
  return bayes - stale * RANK.stalePenalty;
}

const WORDS = {
  uk: ['погано', 'так собі', 'норм', 'смачно', 'топ!'],
  en: ['bad', 'meh', 'okay', 'tasty', 'top!'],
} as const;

export function ratingWord(stars: 1 | 2 | 3 | 4 | 5, lang: 'uk' | 'en'): string {
  return WORDS[lang][stars - 1]!;
}

/** Emoji for the review-drop animation (the only place emoji appear). */
export function ratingEmoji(stars: number | null): string {
  if (stars == null) return '💭';
  return ['🤢', '😕', '🙂', '😋', '🤤'][Math.min(5, Math.max(1, Math.round(stars))) - 1]!;
}
