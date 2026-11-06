import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { readFileSync } from 'node:fs';
import { exportJWK, generateKeyPair } from 'jose';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations');
  const seed = readFileSync('./seed/dev.sql', 'utf8');
  // Fake "Google" signing key: the worker trusts TEST_GOOGLE_JWKS only when ENVIRONMENT is dev.
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const pub = { ...(await exportJWK(publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  const priv = { ...(await exportJWK(privateKey)), kid: 'test-kid', alg: 'RS256' };
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
            TEST_SEED: seed,
            TEST_GOOGLE_JWKS: JSON.stringify({ keys: [pub] }),
            TEST_GOOGLE_PRIVATE_JWK: JSON.stringify(priv),
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
