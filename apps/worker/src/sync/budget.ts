import { CAPS } from './config';

/** Reserves one call for `sku` this month; false (and no increment) once the cap is reached. */
export async function takeBudget(db: D1Database, sku: string, cap: number = CAPS[sku] ?? 0, now = new Date()): Promise<boolean> {
  if (cap <= 0) return false;
  const month = now.toISOString().slice(0, 7);
  const row = await db
    .prepare(
      `INSERT INTO budget_usage (month, sku, calls) VALUES (?1, ?2, 1)
       ON CONFLICT (month, sku) DO UPDATE SET calls = calls + 1 WHERE calls < ?3
       RETURNING calls`,
    )
    .bind(month, sku, cap)
    .first<{ calls: number }>();
  return row != null;
}
