import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../env';
import { ApiError } from '../errors';
import { DEVICE_COOKIE } from '../viewer';

export interface Identity {
  ip: string; // in memory only — never persisted or logged
  ipHash: string;
  ipPrefixHash: string;
  deviceId: string;
  userId: number | null;
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

/** /24 for IPv4, /64 for IPv6. */
export function ipPrefix(ip: string): string {
  if (ip.includes(':')) {
    const [head, tail = ''] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail ? tail.split(':') : [];
    const full = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
    return full.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':') + '::/64';
  }
  const parts = ip.split('.');
  return `${parts.slice(0, 3).join('.')}.0/24`;
}

/** Monthly-rotating HMAC: the key for a month is HMAC(secret, 'YYYY-MM'). */
export async function hashIp(secret: string, value: string, now = new Date()): Promise<string> {
  const monthKey = await hmac(enc.encode(secret), now.toISOString().slice(0, 7));
  return hex(await hmac(monthKey, value));
}

export async function identity(c: Context<AppEnv>): Promise<Identity> {
  const secret = c.env.IP_HASH_SECRET;
  if (!secret) throw new ApiError(503, 'not_configured', 'IP_HASH_SECRET missing');
  const ip = c.req.header('CF-Connecting-IP') ?? '0.0.0.0';
  let deviceId = getCookie(c, DEVICE_COOKIE);
  if (!deviceId || !/^[0-9a-f]{32}$/.test(deviceId)) {
    deviceId = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    setCookie(c, DEVICE_COOKIE, deviceId, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  return {
    ip,
    ipHash: await hashIp(secret, ip),
    ipPrefixHash: await hashIp(secret, ipPrefix(ip)),
    deviceId,
    userId: c.get('user')?.id ?? null,
  };
}
