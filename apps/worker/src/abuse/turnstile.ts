const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Verifies a Turnstile token server-side. Without a secret it passes only in dev. */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  ip: string,
  environment: 'dev' | 'production',
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  if (!secret) return environment === 'dev';
  if (!token) return false;
  const form = new FormData();
  form.set('secret', secret);
  form.set('response', token);
  form.set('remoteip', ip);
  try {
    const res = await fetcher(SITEVERIFY, { method: 'POST', body: form });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
