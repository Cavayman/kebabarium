import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('GET /api/health', () => {
  it('returns ok with the environment name', async () => {
    const res = await SELF.fetch('http://kb.test/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, env: 'dev' });
  });

  it('returns a JSON 404 for unknown api routes', async () => {
    const res = await SELF.fetch('http://kb.test/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
