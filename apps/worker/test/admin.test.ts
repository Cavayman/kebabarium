import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, googleIdToken, MUTATE_HEADERS, seedDev } from './helpers';

const url = (p: string) => `http://kb.test${p}`;
let admin: string;
let user: string;

async function loginAs(sub: string, email: string) {
  const credential = await googleIdToken({ sub, email });
  const res = await SELF.fetch(url('/api/auth/google'), { method: 'POST', headers: MUTATE_HEADERS, body: JSON.stringify({ credential }) });
  return cookieFrom(res, 'kb_session')!;
}

const call = (method: string, path: string, cookie: string, body?: unknown) =>
  SELF.fetch(url(path), {
    method,
    headers: { ...MUTATE_HEADERS, Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeAll(async () => {
  await seedDev();
  admin = await loginAs('admin-1', 'admin@example.com');
  user = await loginAs('user-1', 'user1@example.com');
});

describe('admin guard', () => {
  it('refuses regular users and anonymous visitors', async () => {
    expect((await call('GET', '/api/admin/places?city=lviv', user)).status).toBe(403);
    expect((await SELF.fetch(url('/api/admin/places?city=lviv'))).status).toBe(401);
  });
});

describe('places & chains', () => {
  it('lists and filters places', async () => {
    const res = await call('GET', '/api/admin/places?city=lviv&status=dead', admin);
    const body = (await res.json()) as { items: { id: number }[]; total: number };
    expect(body).toMatchObject({ total: 1, items: [{ id: 12 }] });
    const q = (await (await call('GET', '/api/admin/places?city=lviv&q=кебаб', admin)).json()) as { total: number };
    expect(q.total).toBe(2);
  });

  it('edits a place', async () => {
    const res = await call('PATCH', '/api/admin/places/9', admin, { logoUrl: 'https://example.com/l.png', district: 'Шевченківський' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 9, logoUrl: 'https://example.com/l.png' });
  });

  it('moves a place: the old one dies and links to the new one', async () => {
    const res = await call('POST', '/api/admin/places/7/move-to/5', admin);
    expect(res.status).toBe(200);
    const old = await env.DB.prepare('SELECT status, dead_reason AS r, moved_to_place_id AS m FROM places WHERE id = 7').first();
    expect(old).toEqual({ status: 'dead', r: 'moved', m: 5 });
    expect((await call('POST', '/api/admin/places/5/move-to/5', admin)).status).toBe(400);
  });

  it('creates a chain and assigns a place to it', async () => {
    const c = await call('POST', '/api/admin/chains', admin, { name: 'Doner Point', cityId: 1 });
    const chain = (await c.json()) as { id: number };
    expect(c.status).toBe(201);
    await call('PATCH', '/api/admin/places/10', admin, { chainId: chain.id });
    const list = (await (await call('GET', '/api/admin/chains?city=lviv', admin)).json()) as { name: string; spots: number }[];
    expect(list.find((x) => x.name === 'Doner Point')).toMatchObject({ spots: 1 });
    expect((await call('DELETE', `/api/admin/chains/${chain.id}`, admin)).status).toBe(204);
    expect((await env.DB.prepare('SELECT chain_id AS c FROM places WHERE id = 10').first())!.c).toBeNull();
  });
});

describe('moderation', () => {
  const insert = (ip: string, dev: string, status: string) =>
    env.DB.prepare(
      `INSERT INTO ratings (place_id, stars, is_anonymous, weight, status, ip_hash, ip_prefix_hash, device_id, hold_reasons)
       VALUES (2, 1, 1, 0.5, ?, ?, 'pfx-mod', ?, 'hater') RETURNING id`,
    )
      .bind(status, ip, dev)
      .first<{ id: number }>();

  it('lists held reviews with hashed identity hints only', async () => {
    const r = await insert('iph-a', 'dev-a', 'held');
    const body = (await (await call('GET', '/api/admin/reviews?status=held', admin)).json()) as {
      items: { id: number; reasons: string[]; identity: { device: string } }[];
    };
    const item = body.items.find((i) => i.id === r!.id)!;
    expect(item.reasons).toEqual(['hater']);
    expect(item.identity.device).toBe('dev-a'.slice(0, 8));
  });

  it('approves a held review', async () => {
    const r = await insert('iph-b', 'dev-b', 'held');
    expect((await call('POST', `/api/admin/reviews/${r!.id}/approve`, admin)).status).toBe(200);
    expect((await env.DB.prepare('SELECT status FROM ratings WHERE id = ?').bind(r!.id).first())!.status).toBe('published');
  });

  it('hides everything from one identity', async () => {
    const a = await insert('iph-c', 'dev-c1', 'published');
    const b = await insert('iph-c', 'dev-c2', 'pending');
    const c = await insert('iph-x', 'dev-c1', 'held');
    const res = await call('POST', '/api/admin/reviews/hide-identity', admin, { ratingId: a!.id });
    expect(await res.json()).toEqual({ hidden: 3 });
    for (const r of [a, b, c]) expect((await env.DB.prepare('SELECT status FROM ratings WHERE id = ?').bind(r!.id).first())!.status).toBe('hidden');
  });

  it('bans by a rating identity and unbans', async () => {
    const r = await insert('iph-d', 'dev-d', 'held');
    const res = await call('POST', '/api/admin/bans', admin, { ratingId: r!.id, kind: 'device', days: 7, reason: 'spam' });
    expect(res.status).toBe(201);
    const ban = (await res.json()) as { id: number; valueHash: string; until: string };
    expect(ban.valueHash).toBe('dev-d');
    expect(Date.parse(ban.until)).toBeGreaterThan(Date.now() + 6 * 86400e3);
    expect((await call('DELETE', `/api/admin/bans/${ban.id}`, admin)).status).toBe(204);
  });
});

describe('sync & budget', () => {
  it('starts a sync run and lists it', async () => {
    const res = await call('POST', '/api/admin/sync', admin, { kind: 'discovery' });
    expect(res.status).toBe(202);
    const { runId } = (await res.json()) as { runId: number };
    const runs = (await (await call('GET', '/api/admin/sync-runs', admin)).json()) as { id: number; kind: string }[];
    expect(runs[0]).toMatchObject({ id: runId, kind: 'discovery' });
  });

  it('reports budget usage against caps', async () => {
    const body = (await (await call('GET', '/api/admin/budget', admin)).json()) as { usage: { sku: string; used: number; cap: number }[] };
    expect(body.usage.find((u) => u.sku === 'places.text_search_pro')).toMatchObject({ cap: 4500 });
  });
});
