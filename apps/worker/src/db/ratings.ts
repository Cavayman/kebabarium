export type RatingStatus = 'pending' | 'published' | 'held' | 'hidden';

export interface NewRating {
  placeId: number;
  userId?: number | null;
  nickname?: string | null;
  stars: number;
  text?: string | null;
  isAnonymous: boolean;
  weight: number;
  status: RatingStatus;
  holdReasons?: string[];
  publishAt?: string | null;
  ipHash?: string | null;
  ipPrefixHash?: string | null;
  deviceId?: string | null;
}

export async function insertRating(db: D1Database, r: NewRating): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO ratings (place_id, user_id, nickname, stars, text, is_anonymous, weight, status, hold_reasons,
        publish_at, ip_hash, ip_prefix_hash, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      r.placeId,
      r.userId ?? null,
      r.nickname ?? null,
      r.stars,
      r.text ?? null,
      r.isAnonymous ? 1 : 0,
      r.weight,
      r.status,
      r.holdReasons?.length ? r.holdReasons.join(',') : null,
      r.publishAt ?? null,
      r.ipHash ?? null,
      r.ipPrefixHash ?? null,
      r.deviceId ?? null,
    )
    .first<{ id: number }>();
  return row!.id;
}

export interface OwnRating {
  id: number;
  stars: number;
  text: string | null;
  status: RatingStatus;
}

export async function findUserRating(db: D1Database, placeId: number, userId: number): Promise<OwnRating | null> {
  return db
    .prepare(`SELECT id, stars, text, status FROM ratings WHERE place_id = ? AND user_id = ? AND status != 'hidden'`)
    .bind(placeId, userId)
    .first<OwnRating>();
}

/** Edits a rating, keeping the previous values in rating_history. */
export async function updateRatingWithHistory(
  db: D1Database,
  prev: OwnRating,
  next: { stars: number; text: string | null; status: RatingStatus; holdReasons: string[] },
): Promise<void> {
  await db.batch([
    db.prepare(`INSERT INTO rating_history (rating_id, stars, text) VALUES (?, ?, ?)`).bind(prev.id, prev.stars, prev.text),
    db
      .prepare(
        `UPDATE ratings SET stars = ?, text = ?, status = ?, hold_reasons = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
      )
      .bind(next.stars, next.text, next.status, next.holdReasons.length ? next.holdReasons.join(',') : null, prev.id),
  ]);
}

export async function setRatingStatus(db: D1Database, ids: number[], status: RatingStatus, reason?: string): Promise<void> {
  if (!ids.length) return;
  await db.batch(
    ids.map((id) =>
      db
        .prepare(
          `UPDATE ratings SET status = ?, hold_reasons = COALESCE(?, hold_reasons), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
           WHERE id = ? AND status != 'hidden'`,
        )
        .bind(status, reason ?? null, id),
    ),
  );
}
