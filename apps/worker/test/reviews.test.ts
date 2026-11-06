import { env, SELF } from 'cloudflare:test';
import type { FeedResponse, PlaceDetail, ReviewResult } from '@kebabarium/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { publishDue } from '../src/services/publisher';
import { verifyTurnstile } from '../src/abuse/turnstile';
import { cookieFrom, googleIdToken, MUTATE_HEADERS, seedDev } from './helpers';

const url = (p: string) => `http://kb.test${p}`;

interface Who {
  ip: string;
  device?: string | null;
  session?: string | null;
}

async function review(placeId: number, who: Who, body: Record<string, unknown>) {
  const cookies = [who.device ? `kb_dev=${who.device}` : null, who.session].filter(Boolean).join('; ');
  const res = await SELF.fetch(url(`/api/places/${placeId}/reviews`), {
    method: 'POST',
    headers: { ...MUTATE_HEADERS, 'CF-Connecting-IP': who.ip, ...(cookies ? { Cookie: cookies } : {}) },
    body: JSON.stringify(body),
  });
  const device = cookieFrom(res, 'kb_dev')?.split('=')[1] ?? who.device ?? null;
  return { res, device, json: (await res.json()) as ReviewResult & { error?: { code: string; retryAfterSec?: number } } };
}

async function feed(device?: string | null) {
  const res = await SELF.fetch(url('/api/cities/lviv/feed?source=ours'), { headers: device ? { Cookie: `kb_dev=${device}` } : {} });
  return (await res.json()) as FeedResponse;
}

async function loginAs(sub: string) {
  const credential = await googleIdToken({ sub, email: `${sub}@example.com` });
  const res = await SELF.fetch(url('/api/auth/google'), { method: 'POST', headers: MUTATE_HEADERS, body: JSON.stringify({ credential }) });
  return cookieFrom(res, 'kb_session');
}

const statusOf = async (id: number) =>
  (await env.DB.prepare('SELECT status, hold_reasons AS r FROM ratings WHERE id = ?').bind(id).first<{ status: string; r: string | null }>())!;

beforeAll(seedDev);

describe('anonymous reviews', () => {
  it('are pending, visible only to the author, then published after 10 minutes', async () => {
    const { res, json, device } = await review(7, { ip: '203.0.113.10' }, { stars: 5, text: 'смачно!', nickname: 'гість' });
    expect(res.status).toBe(201);
    expect(json.status).toBe('pending');
    expect(device).toMatch(/^[0-9a-f]{32}$/);

    const mine = await feed(device);
    expect(mine.items.find((i) => i.text === 'смачно!')).toMatchObject({ ownPending: true, author: 'гість' });
    expect((await feed()).items.some((i) => i.text === 'смачно!')).toBe(false);

    await publishDue(env.DB, new Date(Date.now() + 11 * 60 * 1000));
    expect((await feed()).items.find((i) => i.text === 'смачно!')).toBeDefined();
  });

  it('enforce a 7-day cooldown per place for the same device', async () => {
    const first = await review(9, { ip: '198.51.100.1' }, { stars: 4 });
    expect(first.res.status).toBe(201);
    const again = await review(9, { ip: '198.51.100.99', device: first.device }, { stars: 1 });
    expect(again.res.status).toBe(429);
    expect(again.json.error).toMatchObject({ code: 'cooldown' });
    expect(again.json.error!.retryAfterSec!).toBeGreaterThan(6 * 24 * 3600);
  });

  it('still block a cleared-cookie retry from the same IP', async () => {
    await review(10, { ip: '192.0.2.50' }, { stars: 2 });
    const again = await review(10, { ip: '192.0.2.50', device: null }, { stars: 1 });
    expect(again.res.status).toBe(429);
    expect(again.json.error!.code).toBe('cooldown');
  });

  it('rate-limit a /24 network to 3 reviews per hour', async () => {
    for (const [i, place] of [4, 5, 6].entries()) {
      const r = await review(place, { ip: `100.64.7.${i + 1}` }, { stars: 4 });
      expect(r.res.status).toBe(201);
    }
    const fourth = await review(8, { ip: '100.64.7.200' }, { stars: 4 });
    expect(fourth.res.status).toBe(429);
    expect(fourth.json.error!.code).toBe('rate_limited');
  });

  it('hold the 4th anonymous review of one place within an hour (burst guard)', async () => {
    const ids: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      const r = await review(11, { ip: `10.${n}.0.1` }, { stars: 1 });
      expect(r.res.status).toBe(201);
      ids.push(r.json.id);
    }
    expect((await statusOf(ids[2]!)).status).toBe('pending');
    expect(await statusOf(ids[3]!)).toMatchObject({ status: 'held', r: 'burst' });
  });

  it('hold a hater pattern: ≤2★ to 3 places of one district within 24 h, including earlier ones', async () => {
    const who: Who = { ip: '172.20.5.5' };
    const a = await review(2, who, { stars: 1 });
    const b = await review(4, { ...who, device: a.device }, { stars: 2 });
    const c = await review(13, { ...who, device: a.device }, { stars: 1 });
    expect(c.res.status).toBe(201);
    expect(c.json.status).toBe('pending'); // the spammer is not told
    for (const id of [a.json.id, b.json.id, c.json.id]) expect((await statusOf(id)).status).toBe('held');
  });

  it('hold reviews containing links', async () => {
    const r = await review(3, { ip: '172.21.0.1' }, { stars: 5, text: 'дивись https://spam.example' });
    expect(await statusOf(r.json.id)).toMatchObject({ status: 'held', r: 'link' });
  });

  it('reject text over 280 characters', async () => {
    const r = await review(3, { ip: '172.22.0.1' }, { stars: 5, text: 'ш'.repeat(281) });
    expect(r.res.status).toBe(400);
  });

  it('refuse banned networks', async () => {
    const r1 = await review(5, { ip: '172.23.9.1' }, { stars: 3 });
    const hash = (await env.DB.prepare('SELECT ip_prefix_hash AS h FROM ratings WHERE id = ?').bind(r1.json.id).first<{ h: string }>())!.h;
    await env.DB.prepare("INSERT INTO abuse_bans (kind, value_hash, reason) VALUES ('ip_prefix', ?, 'test')").bind(hash).run();
    const r2 = await review(6, { ip: '172.23.9.77' }, { stars: 3 });
    expect(r2.res.status).toBe(403);
    expect(r2.json.error!.code).toBe('banned');
  });

  it('never store a raw IP anywhere', async () => {
    const { results } = await env.DB.prepare('SELECT * FROM ratings').all<Record<string, unknown>>();
    const blob = JSON.stringify(results);
    for (const ip of ['203.0.113.10', '198.51.100.1', '192.0.2.50', '100.64.7.', '172.20.5.5', '10.1.0.1']) expect(blob).not.toContain(ip);
  });

  it('refuse reviews for dead places', async () => {
    const r = await review(12, { ip: '172.24.0.1' }, { stars: 5 });
    expect(r.res.status).toBe(409);
  });
});

describe('logged-in reviews', () => {
  it('publish immediately, then update on the second post with history', async () => {
    const session = await loginAs('reviewer-1');
    const first = await review(7, { ip: '198.18.0.1', session }, { stars: 3, text: 'ok' });
    expect(first.json.status).toBe('published');
    const second = await review(7, { ip: '198.18.0.1', session }, { stars: 5, text: 'стало краще' });
    expect(second.res.status).toBe(201);
    expect(second.json.id).toBe(first.json.id);
    const hist = await env.DB.prepare('SELECT stars, text FROM rating_history WHERE rating_id = ?').bind(first.json.id).all();
    expect(hist.results).toEqual([{ stars: 3, text: 'ok' }]);

    const detail = (await (await SELF.fetch(url('/api/places/7'))).json()) as PlaceDetail;
    expect(detail.reviews.find((r) => r.text === 'стало краще')).toBeDefined();
  });

  it('can edit and delete their own rating and list their history', async () => {
    const session = await loginAs('reviewer-2');
    await review(9, { ip: '198.18.0.2', session }, { stars: 2, text: 'meh' });
    const put = await SELF.fetch(url('/api/places/9/rating'), {
      method: 'PUT',
      headers: { ...MUTATE_HEADERS, Cookie: session! },
      body: JSON.stringify({ stars: 4, text: 'передумав' }),
    });
    expect(put.status).toBe(200);
    const mine = (await (await SELF.fetch(url('/api/me/ratings'), { headers: { Cookie: session! } })).json()) as {
      history: { stars: number; text: string }[];
      top: { id: number; myStars: number }[];
    };
    expect(mine.history[0]).toMatchObject({ stars: 4, text: 'передумав' });
    expect(mine.top[0]).toMatchObject({ id: 9, myStars: 4 });

    const del = await SELF.fetch(url('/api/places/9/rating'), { method: 'DELETE', headers: { ...MUTATE_HEADERS, Cookie: session! } });
    expect(del.status).toBe(204);
    const after = (await (await SELF.fetch(url('/api/me/ratings'), { headers: { Cookie: session! } })).json()) as { history: unknown[] };
    expect(after.history).toEqual([]);
  });

  it('requires a session to edit', async () => {
    const res = await SELF.fetch(url('/api/places/9/rating'), { method: 'PUT', headers: MUTATE_HEADERS, body: JSON.stringify({ stars: 4 }) });
    expect(res.status).toBe(401);
  });
});

describe('turnstile', () => {
  it('skips only in dev without a secret', async () => {
    expect(await verifyTurnstile(undefined, undefined, '1.1.1.1', 'dev')).toBe(true);
    expect(await verifyTurnstile(undefined, undefined, '1.1.1.1', 'production')).toBe(false);
  });

  it('asks Cloudflare siteverify with the token, secret and ip', async () => {
    let sent: FormData | undefined;
    const fake = (async (_u: string, init: RequestInit) => {
      sent = init.body as FormData;
      return new Response(JSON.stringify({ success: true }));
    }) as unknown as typeof fetch;
    expect(await verifyTurnstile('tok', 'sec', '1.2.3.4', 'production', fake)).toBe(true);
    expect([sent!.get('response'), sent!.get('secret'), sent!.get('remoteip')]).toEqual(['tok', 'sec', '1.2.3.4']);
  });
});
