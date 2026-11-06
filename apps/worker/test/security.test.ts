import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { MUTATE_HEADERS, seedDev } from './helpers';

beforeAll(seedDev);

describe('security headers & limits', () => {
  it('sends hardening headers on API responses', async () => {
    const res = await SELF.fetch('http://kb.test/api/health');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await SELF.fetch('http://kb.test/api/places/1/reviews', {
      method: 'POST',
      headers: { ...MUTATE_HEADERS, 'CF-Connecting-IP': '203.0.113.200' },
      body: JSON.stringify({ stars: 5, text: 'x'.repeat(9 * 1024) }),
    });
    expect(res.status).toBe(413);
  });

  it('rejects malformed review bodies with validation_error', async () => {
    const res = await SELF.fetch('http://kb.test/api/places/1/reviews', {
      method: 'POST',
      headers: { ...MUTATE_HEADERS, 'CF-Connecting-IP': '203.0.113.201' },
      body: JSON.stringify({ stars: 9 }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('validation_error');
  });
});
