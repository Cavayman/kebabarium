import { env } from 'cloudflare:test';
import type { RuntimeConfig } from '@kebabarium/shared';
import { describe, expect, it } from 'vitest';
import { app } from '../src/index';

const config = async (over: Partial<typeof env>) => {
  const res = await app.request('/api/config', {}, { ...env, ...over });
  return (await res.json()) as RuntimeConfig;
};

describe('GET /api/config map provider', () => {
  it('uses Google whenever a Maps key exists', async () => {
    expect((await config({ ENVIRONMENT: 'production', GOOGLE_MAPS_BROWSER_KEY: 'k' })).mapProvider).toBe('google');
  });

  it('uses Google in production once Google data can exist (Places key set) even without a Maps key', async () => {
    expect((await config({ ENVIRONMENT: 'production', GOOGLE_PLACES_KEY: 'p' })).mapProvider).toBe('google');
  });

  it('falls back to the open map in production only when no Google key is configured at all', async () => {
    expect((await config({ ENVIRONMENT: 'production' })).mapProvider).toBe('maplibre');
  });
});

describe('GET /api/config Google client id', () => {
  it('serves a real OAuth client id', async () => {
    const id = '123-abc.apps.googleusercontent.com';
    expect((await config({ GOOGLE_OAUTH_CLIENT_ID: id })).googleClientId).toBe(id);
  });

  it('never serves a value that is not a client id (e.g. a client secret pasted by mistake)', async () => {
    expect((await config({ GOOGLE_OAUTH_CLIENT_ID: 'GOCSPX-not-a-client-id' })).googleClientId).toBeNull();
  });
});
