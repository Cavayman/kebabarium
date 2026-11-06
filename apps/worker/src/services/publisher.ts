/** Publishes anonymous reviews whose soft-publish delay has passed (run by the 10-minute cron). */
export async function publishDue(db: D1Database, now: Date = new Date()): Promise<number> {
  const r = await db
    .prepare(
      `UPDATE ratings SET status = 'published', updated_at = ? WHERE status = 'pending' AND publish_at IS NOT NULL AND publish_at <= ?`,
    )
    .bind(now.toISOString(), now.toISOString())
    .run();
  return r.meta.changes ?? 0;
}
