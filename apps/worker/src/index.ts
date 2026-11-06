import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './env';
import { ApiError } from './errors';
import { csrfGuard, withUser } from './auth/middleware';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';

export type { AppEnv } from './env';

export const app = new Hono<AppEnv>();

app.use('/api/*', csrfGuard, withUser);
app.get('/api/health', (c) => c.json({ ok: true, env: c.env.ENVIRONMENT }));
app.route('/api', publicRoutes);
app.route('/api', authRoutes);

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: { code: 'not_found', message: 'Not found' } }, 404);
  }
  return c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text('Not found', 404);
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, ...err.extra } }, err.status);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: { code: 'http_error', message: err.message } }, err.status);
  }
  console.log(JSON.stringify({ level: 'error', msg: 'unhandled', path: c.req.path, error: String(err) }));
  const message = c.env.ENVIRONMENT === 'production' ? 'Internal error' : String(err);
  return c.json({ error: { code: 'internal', message } }, 500);
});

export default { fetch: app.fetch };
