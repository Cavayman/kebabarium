export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT: 'dev' | 'production';
  GOOGLE_PLACES_KEY?: string;
  GOOGLE_MAPS_BROWSER_KEY?: string;
  GOOGLE_MAP_ID?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  SESSION_SECRET?: string;
  IP_HASH_SECRET?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET?: string;
  ADMIN_EMAILS?: string;
  THREADS_APP_ID?: string;
  THREADS_APP_SECRET?: string;
  THREADS_TOKEN?: string;
}

export interface SessionUser {
  id: number;
  role: 'user' | 'admin';
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null } };
