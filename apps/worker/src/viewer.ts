import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from './env';
import type { Viewer } from './services/places';

export const DEVICE_COOKIE = 'kb_dev';

/** Who is looking: used to show people their own pending/held reviews. Session user is added in the auth task. */
export async function viewerOf(c: Context<AppEnv>): Promise<Viewer> {
  const deviceId = getCookie(c, DEVICE_COOKIE) ?? null;
  const user = c.get('user') ?? null;
  return { deviceId, userId: user?.id ?? null };
}
