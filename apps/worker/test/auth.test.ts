import { SELF } from 'cloudflare:test';
import type { LoginResponse, Me } from '@kebabarium/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, googleIdToken, MUTATE_HEADERS, seedDev } from './helpers';

const url = (p: string) => `http://kb.test${p}`;

async function login(claims: Record<string, unknown> = {}, opts: { aud?: string; expSec?: number } = {}) {
  const credential = await googleIdToken(claims, opts);
  const res = await SELF.fetch(url('/api/auth/google'), { method: 'POST', headers: MUTATE_HEADERS, body: JSON.stringify({ credential }) });
  return { res, cookie: cookieFrom(res, 'kb_session') };
}

beforeAll(seedDev);

describe('Google sign-in', () => {
  it('creates a user, sets a session and asks for a nickname', async () => {
    const { res, cookie } = await login();
    expect(res.status).toBe(200);
    expect(cookie).toMatch(/^kb_session=.+/);
    const body = (await res.json()) as LoginResponse;
    expect(body).toMatchObject({ needsNickname: true, suggestedNickname: 'taras', me: { role: 'user', nickname: null } });
    expect(res.headers.getSetCookie().join(';')).toMatch(/HttpOnly/i);
  });

  it('rejects a token for another client id', async () => {
    const { res } = await login({ sub: 'x-aud' }, { aud: 'someone-else' });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_token');
  });

  it('rejects an expired token', async () => {
    const { res } = await login({ sub: 'x-exp' }, { expSec: -60 });
    expect(res.status).toBe(401);
  });

  it('makes ADMIN_EMAILS users admins (case-insensitive)', async () => {
    const { res } = await login({ sub: 'admin-sub', email: 'Admin@Example.com' });
    expect(((await res.json()) as LoginResponse).me.role).toBe('admin');
  });

  it('suggests a free nickname when the first name is taken', async () => {
    const { res } = await login({ sub: 'oleg-2', given_name: 'Oleg', email: 'o2@example.com' });
    expect(((await res.json()) as LoginResponse).suggestedNickname).toBe('oleg2');
  });
});

describe('profile', () => {
  it('returns null for anonymous visitors', async () => {
    const res = await SELF.fetch(url('/api/me'));
    expect(await res.json()).toBeNull();
  });

  it('sets a nickname and reports a taken one with 409', async () => {
    const { cookie } = await login({ sub: 'nick-sub', email: 'nick@example.com', given_name: 'Nick' });
    const patch = (body: unknown) =>
      SELF.fetch(url('/api/me'), { method: 'PATCH', headers: { ...MUTATE_HEADERS, Cookie: cookie! }, body: JSON.stringify(body) });

    const taken = await patch({ nickname: 'OLEG' });
    expect(taken.status).toBe(409);
    expect(((await taken.json()) as { error: { code: string } }).error.code).toBe('nickname_taken');

    const bad = await patch({ nickname: 'a b' });
    expect(bad.status).toBe(400);

    const ok = await patch({ nickname: 'nick_lviv', showRealName: true, lang: 'en' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ nickname: 'nick_lviv', showRealName: true, lang: 'en', displayName: 'Nick Shevchenko' });

    const me = (await (await SELF.fetch(url('/api/me'), { headers: { Cookie: cookie! } })).json()) as Me;
    expect(me.nickname).toBe('nick_lviv');
  });

  it('logs out by clearing the cookie', async () => {
    const res = await SELF.fetch(url('/api/auth/logout'), { method: 'POST', headers: MUTATE_HEADERS });
    expect(res.headers.getSetCookie().join(';')).toMatch(/kb_session=;.*Max-Age=0/i);
  });
});

describe('CSRF guard', () => {
  it('refuses mutations without the SPA header', async () => {
    const res = await SELF.fetch(url('/api/auth/logout'), { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('ignores a forged session cookie', async () => {
    const res = await SELF.fetch(url('/api/me'), { headers: { Cookie: 'kb_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.bad' } });
    expect(await res.json()).toBeNull();
  });
});
