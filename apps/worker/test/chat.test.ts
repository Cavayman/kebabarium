import { env, SELF } from 'cloudflare:test';
import type { ChatMessage, ChatResponse } from '@kebabarium/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { cookieFrom, googleIdToken, MUTATE_HEADERS, seedDev } from './helpers';

const url = (p: string) => `http://kb.test${p}`;

async function loginAs(sub: string, email = `${sub}@example.com`) {
  const credential = await googleIdToken({ sub, email });
  const res = await SELF.fetch(url('/api/auth/google'), { method: 'POST', headers: MUTATE_HEADERS, body: JSON.stringify({ credential }) });
  return cookieFrom(res, 'kb_session')!;
}

const say = (cookie: string | null, text: string, city = 'lviv') =>
  SELF.fetch(url(`/api/cities/${city}/chat`), {
    method: 'POST',
    headers: { ...MUTATE_HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ text }),
  });
const read = async (q = '', cookie?: string, city = 'lviv') =>
  (await (await SELF.fetch(url(`/api/cities/${city}/chat${q}`), { headers: cookie ? { Cookie: cookie } : {} })).json()) as ChatResponse;
const setNick = (cookie: string, nickname: string) =>
  SELF.fetch(url('/api/me'), { method: 'PATCH', headers: { ...MUTATE_HEADERS, Cookie: cookie }, body: JSON.stringify({ nickname }) });

let taras: string;
let olena: string;
let admin: string;

beforeAll(async () => {
  await seedDev();
  taras = await loginAs('chat-taras');
  await setNick(taras, 'taras_shaurma');
  olena = await loginAs('chat-olena');
  await setNick(olena, 'olena');
  admin = await loginAs('chat-admin', 'admin@example.com');
});

describe('city chat', () => {
  it('is readable by everyone, but anonymous visitors cannot post', async () => {
    const anon = await read();
    expect(anon.canPost).toBe(false);
    expect(Array.isArray(anon.items)).toBe(true);
    const res = await say(null, 'привіт');
    expect(res.status).toBe(401);
  });

  it('posts a message under the nickname and shows it to others, oldest first, with own messages marked', async () => {
    const res = await say(taras, '  Де найкраща шаурма біля Ринку?  ');
    expect(res.status).toBe(201);
    const msg = (await res.json()) as ChatMessage;
    expect(msg).toMatchObject({ author: 'taras_shaurma', text: 'Де найкраща шаурма біля Ринку?', own: true });
    await new Promise((r) => setTimeout(r, 5)); // a distinct timestamp is not needed, ids order the chat
    expect((await say(olena, 'Кебаб Шеф, однозначно')).status).toBe(201);

    const forOlena = await read('', olena);
    expect(forOlena.canPost).toBe(true);
    const last = forOlena.items.slice(-2);
    expect(last.map((m) => [m.author, m.own])).toEqual([
      ['taras_shaurma', false],
      ['olena', true],
    ]);
    expect(Date.parse(last[0]!.createdAt)).not.toBeNaN();
  });

  it('returns only newer messages after a given id, for cheap polling', async () => {
    const all = await read();
    const lastId = all.items.at(-1)!.id;
    expect((await read(`?after=${lastId}`)).items).toEqual([]);
    expect((await read(`?after=${all.items.at(-2)!.id}`)).items.map((m) => m.id)).toEqual([lastId]);
  });

  it('keeps every city in its own room', async () => {
    expect((await read('', undefined, 'sumy')).items.some((m) => m.author === 'taras_shaurma')).toBe(false);
  });

  it('refuses empty, too long and link messages', async () => {
    expect((await say(olena, '   ')).status).toBe(400);
    expect((await say(olena, 'x'.repeat(501))).status).toBe(400);
    const link = await say(olena, 'дивись https://spam.example.com');
    expect(link.status).toBe(422);
    expect(((await link.json()) as { error: { code: string } }).error.code).toBe('links_not_allowed');
  });

  it('slows down people who post too fast', async () => {
    const fast = await loginAs('chat-fast');
    await setNick(fast, 'fast_eddie');
    expect((await say(fast, 'раз')).status).toBe(201);
    const again = await say(fast, 'два');
    expect(again.status).toBe(429);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('chat_cooldown');
  });

  it('asks for a nickname before the first message', async () => {
    const noNick = await loginAs('chat-no-nick');
    const res = await say(noNick, 'привіт');
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('nickname_required');
    expect((await read('', noNick)).canPost).toBe(false);
  });

  it('does not let banned users post', async () => {
    const banned = await loginAs('chat-banned');
    await setNick(banned, 'troll');
    const id = (await env.DB.prepare(`SELECT id FROM users WHERE google_sub = 'chat-banned'`).first<{ id: number }>())!.id;
    await env.DB.prepare(`INSERT INTO abuse_bans (kind, value_hash, reason) VALUES ('user', ?, 'test')`).bind(String(id)).run();
    expect((await say(banned, 'бу')).status).toBe(403);
  });

  it('lets admins hide a message for everyone', async () => {
    const author = await loginAs('chat-hidden-author');
    await setNick(author, 'hidden_author');
    const res = await say(author, 'це видалять');
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as ChatMessage;
    const list = await SELF.fetch(url('/api/admin/chat?city=lviv'), { headers: { Cookie: admin } });
    expect(((await list.json()) as { id: number }[]).some((m) => m.id === id)).toBe(true);
    expect((await SELF.fetch(url(`/api/admin/chat/${id}`), { method: 'DELETE', headers: { ...MUTATE_HEADERS, Cookie: olena } })).status).toBe(403);
    expect((await SELF.fetch(url(`/api/admin/chat/${id}`), { method: 'DELETE', headers: { ...MUTATE_HEADERS, Cookie: admin } })).status).toBe(204);
    expect((await read()).items.some((m) => m.id === id)).toBe(false);
  });
});
