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
