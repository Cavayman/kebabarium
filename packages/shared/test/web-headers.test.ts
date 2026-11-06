// Static assets are served by Cloudflare without running the Worker, so their security headers come from public/_headers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const headers = () => readFileSync(join(__dirname, '../../../apps/web/public/_headers'), 'utf8');
const csp = () => headers().match(/Content-Security-Policy: (.*)/)?.[1] ?? '';

describe('static asset headers', () => {
  it('applies to every path', () => expect(headers().split('\n')[0]).toBe('/*'));

  it('allows exactly the third parties the app uses', () => {
    const policy = csp();
    for (const needed of ['https://maps.googleapis.com', 'https://accounts.google.com', 'https://challenges.cloudflare.com', "frame-ancestors 'none'", "object-src 'none'"]) {
      expect(policy).toContain(needed);
    }
    expect(policy).not.toContain('*;');
  });

  it('sets the basic hardening headers', () => {
    const h = headers();
    expect(h).toContain('X-Content-Type-Options: nosniff');
    expect(h).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(h).toContain('Permissions-Policy: geolocation=(self)');
    expect(h).toContain('Strict-Transport-Security: max-age=');
  });
});
