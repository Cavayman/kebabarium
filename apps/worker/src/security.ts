import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppEnv } from './env';
import { ApiError } from './errors';

/** API responses are JSON only: the strictest possible CSP. (The SPA's CSP lives in apps/web/public/_headers.) */
export const apiSecurityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  const h = c.res.headers;
  h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  h.set('X-Frame-Options', 'DENY');
  h.set('Cross-Origin-Resource-Policy', 'same-origin');
};

/** Mutating requests are tiny (a review is ≤ 280 chars); anything above 8 KB is refused. */
export const apiBodyLimit = bodyLimit({
  maxSize: 8 * 1024,
  onError: () => {
    throw new ApiError(413, 'payload_too_large', 'Request body too large');
  },
});
