import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  return {
    plugins: [
      cloudflareTest({
        main: './src/index.ts',
        miniflare: {
          compatibilityDate: '2026-08-20',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          bindings: {
            ENVIRONMENT: 'dev',
            TEST_MIGRATIONS: migrations,
            SESSION_SECRET: 'test-session-secret-0123456789abcdef',
            IP_HASH_SECRET: 'test-ip-hash-secret',
            GOOGLE_OAUTH_CLIENT_ID: 'test-client.apps.googleusercontent.com',
            ADMIN_EMAILS: 'admin@example.com',
          },
        },
      }),
    ],
    test: { setupFiles: ['./test/setup.ts'] },
  };
});
