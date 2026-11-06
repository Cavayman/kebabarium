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

import { importJWK, SignJWT } from 'jose';

/** Signs an ID token the way Google would, with the test key the worker trusts in dev. */
export async function googleIdToken(claims: Record<string, unknown> = {}, opts: { aud?: string; expSec?: number } = {}) {
  const key = await importJWK(JSON.parse(env.TEST_GOOGLE_PRIVATE_JWK), 'RS256');
  return new SignJWT({ email: 'taras@example.com', email_verified: true, given_name: 'Taras', family_name: 'Shevchenko', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuer('https://accounts.google.com')
    .setAudience(opts.aud ?? env.GOOGLE_OAUTH_CLIENT_ID!)
    .setSubject((claims.sub as string) ?? 'google-sub-taras')
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + (opts.expSec ?? 3600))
    .sign(key);
}

export const MUTATE_HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'kebabarium' };

export function cookieFrom(res: Response, name: string): string | null {
  const all = res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie') ?? ''];
  const hit = all.find((c) => c.startsWith(`${name}=`));
  return hit ? hit.split(';')[0]! : null;
}
