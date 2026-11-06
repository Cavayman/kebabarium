/** Atomically increments and returns the call counter for (month, sku). */
export async function incrementBudget(db: D1Database, month: string, sku: string): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO budget_usage (month, sku, calls) VALUES (?, ?, 1)
       ON CONFLICT (month, sku) DO UPDATE SET calls = calls + 1 RETURNING calls`,
    )
    .bind(month, sku)
    .first<{ calls: number }>();
  return row!.calls;
}

export async function getBudgetUsage(db: D1Database, month: string): Promise<Record<string, number>> {
  const { results } = await db.prepare(`SELECT sku, calls FROM budget_usage WHERE month = ?`).bind(month).all<{ sku: string; calls: number }>();
  return Object.fromEntries(results.map((r) => [r.sku, r.calls]));
}
