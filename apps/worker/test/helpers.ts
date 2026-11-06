import { env } from 'cloudflare:test';

let seeded = false;

/** Applies seed/dev.sql once per test file (statements are idempotent `INSERT OR IGNORE`). */
export async function seedDev(): Promise<void> {
  if (seeded) return;
  const statements = env.TEST_SEED.split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  await env.DB.batch(statements.map((s) => env.DB.prepare(s)));
  seeded = true;
}
