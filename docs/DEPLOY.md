# Deploying Кебабаріум to Cloudflare

Everything runs as one Cloudflare Worker (`apps/worker`): the API, the hourly sync cron and the Angular app (static assets).
You can deploy first and add the third-party keys later — each feature switches on as soon as its secret exists.

| Without… | You get |
|---|---|
| any Google key | the open (MapLibre) map, no spots until Places sync runs |
| `GOOGLE_PLACES_KEY` | no automatic discovery of spots / Google ratings |
| `GOOGLE_MAPS_BROWSER_KEY` + `GOOGLE_MAP_ID` | (once Places is set) the Google map stays blank — set both together |
| `GOOGLE_OAUTH_CLIENT_ID` | "Увійти" says sign-in is not configured; anonymous reviews still work |
| `TURNSTILE_*` | anonymous reviews are refused in production (bot check cannot pass) |
| `THREADS_TOKEN` | Threads tab shows "Threads тимчасово недоступний" |

## 0. One-time: Cloudflare login and database

```bash
cd apps/worker
npx wrangler login                     # opens the browser; log in to your Cloudflare account
npx wrangler d1 create kebabarium      # prints a database_id
```

Put the printed `database_id` into `apps/worker/wrangler.jsonc` (top-level `d1_databases`, not the `env.dev` one).

## 1. Required secrets

```bash
cd apps/worker
openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET
openssl rand -hex 32 | npx wrangler secret put IP_HASH_SECRET
npx wrangler secret put ADMIN_EMAILS        # comma-separated, e.g. you@gmail.com
```

## 2. Deploy

```bash
npm run deploy          # from the repo root: builds web, applies D1 migrations remotely, wrangler deploy
npm run check-secrets   # ✓/✗ per secret, values are never printed
```

The URL is printed by wrangler: `https://kebabarium.<your-subdomain>.workers.dev`.

Smoke check:
- `https://…/api/health` → `{"ok":true,"env":"production"}`
- `https://…/api/cities` → contains `lviv`
- the home page shows the terminal boot screen, then the map.

## 3. Google (spots, ratings, map)

1. Google Cloud console → new project → **enable billing** (free monthly quotas still apply; the sync never exceeds the caps in `apps/worker/src/sync/config.ts`).
2. Enable **Places API (New)** and **Maps JavaScript API**.
3. Credentials → API key #1 = **server key**: restrict to *Places API (New)*. → `npx wrangler secret put GOOGLE_PLACES_KEY`
4. API key #2 = **browser key**: application restriction *HTTP referrers* → `https://kebabarium.<your-subdomain>.workers.dev/*` (add your domain later); API restriction *Maps JavaScript API*. → `npx wrangler secret put GOOGLE_MAPS_BROWSER_KEY`
5. Maps Management → **Create Map ID** (JavaScript, *Vector*, tilt and rotation on) → Map Styles → create a style → **Import JSON** → paste `apps/web/map-style/google-dark-lineart.json` → attach the style to the Map ID. → `npx wrangler secret put GOOGLE_MAP_ID`
6. Second budget fence (recommended): Quotas → *Places API (New)* → cap requests per day (e.g. 200), *Maps JavaScript API* map loads per day (e.g. 300).
7. First data: log in as admin → Адмінка → Синхронізація → «Запустити зараз: discovery» (or wait for the hourly cron).

## 4. Google sign-in

Google Cloud → APIs & Services → **OAuth consent screen** (External, app name «Кебабаріум», your email, privacy URL `https://…/privacy`) → **Credentials → OAuth client ID → Web application** → Authorized JavaScript origins: `https://kebabarium.<your-subdomain>.workers.dev`.
→ `npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID` (the `…apps.googleusercontent.com` id; it is public, but kept as a secret for one place of config).

## 5. Cloudflare Turnstile (bot check for anonymous reviews)

Cloudflare dashboard → Turnstile → Add widget → hostname `kebabarium.<your-subdomain>.workers.dev`, mode **Managed**.
→ `npx wrangler secret put TURNSTILE_SITE_KEY` and `npx wrangler secret put TURNSTILE_SECRET`

## 6. Threads mentions

1. developers.facebook.com → Create app → use case **Access the Threads API**.
2. Permissions: `threads_basic`, `threads_keyword_search`.
3. Generate a **long-lived** user token for your Threads account → `npx wrangler secret put THREADS_TOKEN` (the cron refreshes it automatically before expiry).
4. Submit **App Review** for `threads_keyword_search` (needs the live URL, the privacy page `https://…/privacy` and a short screencast). Until it is approved, search only returns your own posts.

## 7. Own domain (later)

Workers → kebabarium → Settings → Domains & Routes → **Custom domain**. Then add the domain to: the Google browser key referrers, the OAuth origins, the Turnstile hostnames, and replace the contact email on `/privacy` (`apps/web/src/app/pages/privacy/privacy.page.html`).

## Local development

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
npm -w apps/worker run db:migrate:local
npm -w apps/worker run db:seed:local      # dev-only sample spots
npm -w apps/web run build
npm run dev                               # http://localhost:8787
```
