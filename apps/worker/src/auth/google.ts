import { createLocalJWKSet, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../env';
import { ApiError } from '../errors';

export interface GoogleProfile {
  sub: string;
  email: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

let remote: JWTVerifyGetKey | undefined;

export function googleJwks(env: Env): JWTVerifyGetKey {
  if (env.ENVIRONMENT === 'dev' && env.TEST_GOOGLE_JWKS) return createLocalJWKSet(JSON.parse(env.TEST_GOOGLE_JWKS));
  remote ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
  return remote;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string | undefined, jwks: JWTVerifyGetKey): Promise<GoogleProfile> {
  if (!clientId) throw new ApiError(503, 'auth_not_configured', 'Sign-in is not configured');
  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: ['accounts.google.com', 'https://accounts.google.com'],
      audience: clientId,
    });
    if (!payload.sub || typeof payload.email !== 'string' || payload.email_verified === false) throw new Error('missing claims');
    return payload as unknown as GoogleProfile;
  } catch {
    throw new ApiError(401, 'invalid_token', 'Invalid Google credential');
  }
}
