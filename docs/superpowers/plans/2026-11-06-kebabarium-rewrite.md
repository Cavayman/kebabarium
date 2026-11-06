# Kebabarium Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2019 Java/Angular-6 stub with a production-ready Kebabarium: a Cloudflare Worker (Hono + D1 + hourly cron) serving an Angular SPA with a dark Google map of 3D rating columns, live feed, leaderboards, anonymous-but-protected reviews, Google sign-in, nearby radar and an admin panel.

**Architecture:** One Worker serves `/api/*` (Hono) and the built Angular app (Workers Static Assets, SPA fallback). D1 holds cities/places/ratings/external reviews; a cron trigger syncs Google Places + Threads within a hard monthly budget. Rating maths and the colour/height scale live in a shared TS package used by both sides so the map, tiles and API never disagree.

**Tech Stack:** TypeScript 5, Cloudflare Workers + Wrangler 4, Hono 4, D1, `jose` (JWT/JWKS), Vitest + `@cloudflare/vitest-pool-workers`, Angular (latest stable, standalone + signals, `@angular/build:unit-test` with Vitest), `@jsverse/transloco`, Google Maps JS API (vector map, Map ID) + `@deck.gl/google-maps` / `@deck.gl/layers`, MapLibre GL (dev-only map provider), Cloudflare Turnstile, Google Identity Services.

**Spec:** `docs/superpowers/specs/2026-11-06-kebabarium-rewrite-design.md` (approved). Visual reference: `docs/superpowers/mockups/home.html` — when the plan says "as in the mockup", copy the CSS/markup/animation from that file.

## Global Constraints

- npm workspaces monorepo: `apps/worker`, `apps/web`, `packages/shared`; the old `tutorial-server/`, `tutorial-web/`, root `pom.xml` are deleted.
- Node ≥ 20 for tooling; Worker compat date `2026-11-01`, flag `nodejs_compat`.
- UI languages: `uk` (default) and `en`; language auto-detected from `navigator.language`, switch lives only in the profile menu; every user-facing string in `apps/web/src/assets/i18n/{uk,en}.json`.
- Rating colour stops (exact): `1 #e5484d · 2.2 #ef6a3c · 3 #f59e1b · 3.7 #e3c12a · 4.2 #a6d13a · 4.6 #4fd46b · 4.9 #22c77a`; dead = `#2e2e2e`. Brand accent `#ff7a00` is never a rating colour.
- Column height (metres): dead → 60; `r < 3` → 30; else `30 + ((r − 3) / 2)^2.2 × 1100`; multiplied by zoom factor (exponential base 2): z12 → 1, z13.5 → 0.5, z16 → 0.12.
- Combined score = mean(our, google) when both exist, else whichever exists, else null. Our score = weighted mean of `published` ratings, weight 1.0 logged-in / 0.5 anonymous.
- No glow effects (no coloured outer box-shadow/text-shadow/drop-shadow); flat buttons; neutral drop shadows only.
- Emoji only in the review-drop animation (and nowhere else in UI chrome).
- Raw IP addresses are never written to D1 or logs.
- Mock/seed data only in local dev (`seed/dev.sql`); production never contains invented places/reviews.
- Google content (ratings, reviews, photos) only rendered on the Google map provider, always with a "Google" badge; the MapLibre provider is dev-only and never receives Google content in production builds.
- Every external API call goes through `budget.take(sku)`; when the monthly cap is reached the call is skipped, not retried.
- Anti-abuse thresholds live in `apps/worker/src/abuse/config.ts` (one object, no magic numbers elsewhere).

## Review Focus

1. **Place with no ratings at all (no Google rating, no ours)** → score `null`: grey stub column, tile shows "—", excluded from spot leaderboard, never `NaN` anywhere. Test in Task 3 and Task 4.
2. **GPS denied / timeout / user outside every active city** → friendly message and "tap the map to set your point"; nearby never crashes or shows another city. Test in Task 15.
3. **Same anonymous person retries after clearing cookies or switching to mobile data on the same /24** → still blocked by ip_hash / ip_prefix rules. Test in Task 6.
4. **Google or Threads API down / key missing / budget exhausted** → cron finishes, writes `sync_runs.error`, site keeps serving cached data; Threads tab shows "Threads тимчасово недоступний". Test in Tasks 8–10.
5. **Very long names / reviews with emoji, Cyrillic, RTL or HTML** → rendered as text (no HTML injection), truncated with ellipsis in panels, full in the card. Test in Task 4 (API returns raw text) and Task 14 (card escapes).

---

## Phase A — Foundation

### Task 1: Monorepo, Worker skeleton, CI script

**Files:**
- Delete: `tutorial-server/`, `tutorial-web/`, `pom.xml`, `LICENSE` stays.
- Create: `package.json` (workspaces, scripts `test`, `build`, `dev`, `lint`, `deploy`), `tsconfig.base.json`, `.editorconfig`, `.gitignore` (+ `node_modules`, `.wrangler`, `dist`, `.dev.vars`), `README.md` (dev/run/deploy in short).
- Create: `apps/worker/{package.json,tsconfig.json,wrangler.jsonc,vitest.config.ts,src/index.ts,src/env.ts,test/health.test.ts}`
- Create: `packages/shared/{package.json,tsconfig.json,src/index.ts}`

**Interfaces:**
- Produces: `Env` in `apps/worker/src/env.ts` with bindings `DB: D1Database`, `ASSETS: Fetcher`, `RATE_LIMITER?`, vars `ENVIRONMENT: 'dev'|'production'`, secrets from spec §6 table (all `string | undefined`). `app: Hono<{ Bindings: Env }>` exported from `src/index.ts`, default export `{ fetch: app.fetch, scheduled }`.
- `wrangler.jsonc`: `main: src/index.ts`, `assets: { directory: "../web/dist/web/browser", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `d1_databases: [{ binding: "DB", database_name: "kebabarium", migrations_dir: "migrations" }]`, `triggers: { crons: ["0 * * * *", "*/10 * * * *"] }` (hourly sync + 10-min publisher), `observability: { enabled: true }`.

- [ ] **Step 1:** Write `test/health.test.ts`: `GET /api/health` → 200 `{ ok: true, env: 'dev' }`.
- [ ] **Step 2:** Run `npm -w apps/worker test` → FAIL (no route).
- [ ] **Step 3:** Implement the Hono app with `/api/health`, JSON error handler (`{ error: { code, message } }`, 500 hides internals in production), 404 for unknown `/api/*`.
- [ ] **Step 4:** Run `npm test` from root → PASS (runs worker + shared).
- [ ] **Step 5:** Commit `chore: replace java stub with worker/web/shared monorepo`.

### Task 2: D1 schema, migrations, dev seed, query layer

**Files:**
- Create: `apps/worker/migrations/0001_init.sql`, `apps/worker/seed/dev.sql`, `apps/worker/src/db/{cities,places,ratings,external,users,bans,sync,budget}.ts`, `apps/worker/test/db.test.ts`

**Interfaces:**
- Tables exactly as spec §7 plus: `budget_usage(month TEXT, sku TEXT, calls INTEGER, PRIMARY KEY(month, sku))`, `sync_cursor(key TEXT PRIMARY KEY, value TEXT)`, `places.discovered_at`, `places.last_seen_at`, `places.dead_candidate INTEGER DEFAULT 0`, `ratings.publish_at`, indexes on `ratings(place_id,status)`, `ratings(ip_hash,created_at)`, `ratings(ip_prefix_hash,created_at)`, `ratings(device_id,created_at)`, `external_reviews(place_id,published_at)`, `places(city_id,status)`. Partial unique index `ratings(place_id,user_id) WHERE user_id IS NOT NULL AND status != 'hidden'`.
- Each `db/*.ts` exports plain async functions taking `db: D1Database` first, e.g. `listPlaces(db, cityId): Promise<PlaceRow[]>`, `getPlace(db, id)`, `insertRating(db, r: NewRating): Promise<number>`, `upsertExternal(db, e)`, `getUserBySub(db, sub)`, `createUser(db, u)`. Row types live next to the functions.
- Seed: Lviv city (`slug 'lviv'`, centre `49.832, 24.022`, zoom 12.4, bbox `[23.90,49.76,24.13,49.90]`) in `0001_init.sql` (real, needed in prod); the 12 mockup places + sample ratings only in `seed/dev.sql`.

- [ ] **Step 1:** Tests: migrations apply in the vitest pool; `listPlaces` returns the 12 seeded places for Lviv; inserting a second non-hidden rating for the same `(place,user)` throws; `incrementBudget(db,'2026-11','places.text_search')` returns 1 then 2.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Write SQL + functions. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(db): d1 schema, seed and query layer`.

### Task 3: Shared scoring & visual scale

**Files:**
- Create: `packages/shared/src/{scale.ts,scoring.ts,types.ts}`, `packages/shared/test/{scale.test.ts,scoring.test.ts}`

**Interfaces:**
- `ratingColor(r: number | null, dead = false): string` — linear RGB interpolation between Global-Constraints stops; `null` → `#4a4a4f`; dead → `#2e2e2e`.
- `ratingStops(): Array<[number, string]>` (for MapLibre/deck expressions and the legend gradient).
- `columnHeight(r: number | null, dead: boolean): number`; `zoomFactor(zoom: number): number`.
- `ourScore(rs: { stars: number; weight: number }[]): number | null`; `combinedScore(our: number | null, google: number | null): number | null`; `round1(n)`.
- `ratingWord(stars: 1|2|3|4|5, lang)` → uk `погано|так собі|норм|смачно|топ!`.
- `types.ts`: `City`, `PlaceSummary`, `PlaceDetail`, `ReviewItem`, `FeedItem { id, source: 'ours'|'google'|'threads', author, stars: number|null, text, placeId: number|null, placeName: string|null, createdAt, url?, emoji }`, `LeaderboardKind`, `LeaderboardRow`, `CityStats { city, spots, reviews, open, dead, lastSyncAt }`, `Me`, `ReviewSubmit`, `ReviewResult { id, status: 'published'|'pending' }`, `ApiError`.

- [ ] **Step 1:** Tests: `ratingColor(5) === '#22c77a'`, `ratingColor(3) === '#f59e1b'`, `ratingColor(1) === '#e5484d'`, `ratingColor(4.4)` is between lime and green; `columnHeight(4.8,false) ≈ 30+0.9^2.2*1100` (±1); `columnHeight(2.1,false) === 30`; `columnHeight(4.8,true) === 60`; `zoomFactor(12)===1`, `zoomFactor(13.5)≈0.5`, `zoomFactor(16)≈0.12`; `ourScore([{stars:5,weight:1},{stars:1,weight:0.5}]) ≈ 3.667`; `ourScore([])===null`; `combinedScore(null,null)===null`; `combinedScore(4.9,4.7)===4.8`; `combinedScore(null,4.2)===4.2`. Review Focus #1: `ratingColor(null)` returns the grey, no throw.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(shared): rating scale, scoring and api types`.

## Phase B — API

### Task 4: Public read API

**Files:**
- Create: `apps/worker/src/routes/public.ts`, `apps/worker/src/services/{places,leaderboard,feed,stats,geo}.ts`, `apps/worker/test/public.test.ts`

**Interfaces:**
- Consumes: Task 2 queries, Task 3 `ourScore/combinedScore`.
- Routes per spec §9 Public: `GET /api/cities`, `/api/cities/:slug/places` → `PlaceSummary[]` (excludes `hidden`; includes `dead` with `status`), `/api/places/:id` → `PlaceDetail` (latest 5 reviews merged ours+google, move chain both directions, ratings of whole move chain counted in our score), `/api/cities/:slug/feed?since=ISO&source=all|ours|google|threads&limit=30`, `/api/cities/:slug/leaderboard?kind=spots|chains|districts|tasters&limit=10`, `/api/cities/:slug/stats` → `CityStats`, `/api/places/near?lat&lng&r` (r ∈ {1,2,5}, haversine, open only, sorted by score desc then distance) → `{ radiusKm, autoWidened: boolean, items: (PlaceSummary & { distanceM, walkMin })[] }` with auto-widen 1→2→5 when < 3 results.
- `GET /api/config` → `{ mapsBrowserKey, mapId, turnstileSiteKey, googleClientId, mapProvider: 'google'|'maplibre' }` (`maplibre` only when `ENVIRONMENT==='dev'` and no maps key; public values only — new vars `GOOGLE_MAPS_BROWSER_KEY`, `GOOGLE_MAP_ID`, `TURNSTILE_SITE_KEY` in `Env`).
- `PlaceSummary.score` = combined, rounded to 1 decimal; Google numbers included only with `googleAttribution: true`.
- Caching: `Cache-Control: public, max-age=30` on places/leaderboard/stats, `no-store` on feed.
- Taster leaderboard excludes users with `hide_from_leaderboard`, shows nickname (or real name if `show_real_name`). Pending/held ratings are excluded everywhere except for the author (Task 6).

- [ ] **Step 1:** Tests (seeded DB): places returns 12 for lviv with `Шаурма на Коновальця` score 4.8; unknown slug → 404 `{error:{code:'city_not_found'}}`; place with no ratings & no google → `score: null` (Review Focus #1); leaderboard `spots` first row is Коновальця, `null`-score places absent; feed `source=threads` returns only threads; feed `since` filters; near at `24.0245,49.8375` r=1 returns ≥3 items sorted by score, and at a far point auto-widens to 5 with `autoWidened: true`; a review text containing `<script>` comes back verbatim as text (Review Focus #5).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(api): public read endpoints`.

### Task 5: Auth — Google sign-in, sessions, profile

**Files:**
- Create: `apps/worker/src/auth/{google.ts,session.ts,middleware.ts}`, `apps/worker/src/routes/auth.ts`, `apps/worker/test/auth.test.ts`

**Interfaces:**
- `verifyGoogleIdToken(idToken, clientId, jwks?: JWTVerifyGetKey): Promise<{ sub, email, given_name?, family_name?, picture? }>` (jose `createRemoteJWKSet('https://www.googleapis.com/oauth2/v3/certs')`, issuer `accounts.google.com`/`https://accounts.google.com`, audience = `GOOGLE_OAUTH_CLIENT_ID`).
- `issueSession(c, userId)` → cookie `kb_session` (HS256 with `SESSION_SECRET`, 30 days, HttpOnly, Secure, SameSite=Lax, Path=/). `readSession(c): Promise<{ userId } | null>`.
- Middleware `withUser` (sets `c.var.user: Me | null`), `requireUser`, `requireAdmin` (role from DB; on every login role = `admin` iff email ∈ `ADMIN_EMAILS` comma list, case-insensitive).
- Routes: `POST /api/auth/google { credential }` → `{ me, needsNickname }`; `POST /api/auth/logout`; `GET /api/me` → `Me | null`; `PATCH /api/me { nickname?, showRealName?, hideFromLeaderboard?, lang? }` — nickname 3–24 chars `[\p{L}\p{N}_.-]`, unique case-insensitive → 409 `nickname_taken`.
- On first login nickname is `null`; `needsNickname: true`; suggestion = `given_name` (deduped with numeric suffix) returned as `suggestedNickname`.
- CSRF: all mutating `/api/*` require header `X-Requested-With: kebabarium` (SPA sets it); reject otherwise 403.

- [ ] **Step 1:** Tests with a local JWKS (jose `generateKeyPair`): valid token creates user + cookie; wrong `aud` → 401; admin email gets `role:'admin'`; `PATCH /api/me` with taken nickname → 409; missing `X-Requested-With` → 403; `/api/me` without cookie → `null`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(auth): google sign-in and sessions`.

### Task 6: Reviews & anti-abuse

**Files:**
- Create: `apps/worker/src/abuse/{config.ts,identity.ts,turnstile.ts,rules.ts,content.ts}`, `apps/worker/src/routes/reviews.ts`, `apps/worker/src/services/publisher.ts`, `apps/worker/test/{reviews.test.ts,abuse.test.ts}`

**Interfaces:**
- `config.ts`: `ABUSE = { cooldownDays: 7, anonPerHour: 3, anonPerDay: 10, userPerDay: 30, burstAnonPerPlacePerHour: 3, haterWindowH: 24, haterMinPlaces: 3, haterLowStars: 2, maxText: 280, softPublishMin: 10, anonWeight: 0.5, userWeight: 1 }`.
- `identity(c, env): Promise<{ ipHash, ipPrefixHash, deviceId, userId|null, setDeviceCookie: boolean }>` — IP from `CF-Connecting-IP`; prefix /24 (v4) or /64 (v6); HMAC-SHA256 with key = HMAC(`IP_HASH_SECRET`, `YYYY-MM`) (monthly rotation); device cookie `kb_dev` (random 128-bit, 1 year, HttpOnly).
- `verifyTurnstile(token, secret, ip): Promise<boolean>` (skip → true only when `ENVIRONMENT==='dev'` and secret missing).
- `evaluate(db, ctx): Promise<{ decision: 'reject', code: 'cooldown'|'rate_limited'|'banned', retryAfterSec } | { decision: 'accept', status: 'pending'|'published'|'held', reasons: string[] }>` — order: bans → cooldown (any of userId/deviceId/ipHash on same place within 7 d) → rate limits → content (`content.ts`: links `https?://|www\.`, profanity list file `abuse/profanity.txt` uk/ru/en) → burst → hater pattern (also flags earlier ones `held`). Logged-in: `published` immediately unless held. Anonymous: `pending` with `publish_at = now+10min`.
- `POST /api/places/:id/reviews` body `ReviewSubmit { stars: 1..5, text?: string, nickname?: string, turnstileToken? }` → 201 `ReviewResult`, 429 `{ error:{code:'cooldown', retryAfterSec} }`. Logged-in users posting again for the same place update their rating (history row) instead of 429.
- `PUT|DELETE /api/places/:id/rating` (requireUser) edit/delete own with `rating_history`.
- `GET /api/me/ratings` → `{ history: ReviewItem[], top: (PlaceSummary & { myStars })[] }`.
- Feed/place detail include the requester's own pending/held items (matched by deviceId or userId) marked `ownPending: true`.
- `publishDue(db, now)` (publisher.ts) flips `pending` with `publish_at <= now` to `published`; called by the `*/10` cron.

- [ ] **Step 1:** Tests: anon review → 201 `pending`, appears in author's feed only, after `publishDue(now+11min)` visible to all; second review same place same device within 7 d → 429 cooldown with `retryAfterSec>0`; new device but same IP → still 429 (Review Focus #3); different IP same /24 after 3 reviews/hour → 429 `rate_limited`; 3 anon reviews on one place in 1 h → 4th is `held`; same identity 2★ on 3 places of one district in 24 h → 3rd `held` and earlier two `held`; text with `https://x` → `held`; text 281 chars → 400; logged-in second post updates and writes history; ban on ip prefix → 403 `banned`; D1 contains no raw IP string after any request (scan all text columns).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(reviews): reviews with anti-abuse rules`.

### Task 7: Admin API

**Files:**
- Create: `apps/worker/src/routes/admin.ts`, `apps/worker/test/admin.test.ts`

**Interfaces:**
- All under `/api/admin/*` with `requireAdmin`. Spec §9 Admin list, plus `GET /api/admin/places?city&status&q&deadCandidate=1&page`, `PATCH /api/admin/places/:id { name, chainId, logoUrl, district, status }`, `POST /api/admin/places/:id/move-to/:otherId` (sets old `status='dead'`, `dead_reason='moved'`, `moved_to_place_id`), `GET|POST|PATCH|DELETE /api/admin/chains`, `GET /api/admin/reviews?status=pending|held&page`, `POST /api/admin/reviews/:id/approve|hide`, `POST /api/admin/reviews/hide-identity { ratingId }` (hides all by same ip_hash/device/user), `GET|POST /api/admin/bans`, `DELETE /api/admin/bans/:id`, `POST /api/admin/sync { kind: 'discovery'|'refresh'|'threads'|'all' }` (runs Task 10 `runSync` via `c.executionCtx.waitUntil`), `GET /api/admin/sync-runs?limit=50`, `GET /api/admin/budget` → current month usage per SKU vs caps.

- [ ] **Step 1:** Tests: non-admin → 403; move-to links both places and old one is dead with reason; approve flips held→published; hide-identity hides 3 sibling ratings; ban create/delete; budget endpoint returns caps from config.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(admin): admin api`.

## Phase C — Sync

### Task 8: Google Places sync with budget guard

**Files:**
- Create: `apps/worker/src/sync/{budget.ts,google.ts,discovery.ts,refresh.ts,chains.ts,districts.ts,config.ts}`, `apps/worker/test/sync-google.test.ts`

**Interfaces:**
- `sync/config.ts`: `SYNC = { queries: ['шаурма','кебаб','doner','шаверма'], tileKm: 1.5, tilesPerRun: 6, refreshPerRun: 1, deadNotSeenDays: 30, deadNoActivityDays: 180 }`; `CAPS = { 'places.text_search_pro': 4500, 'places.details_enterprise_atmosphere': 900, 'threads.search': 20000 }` per month (defaults chosen under Google's per-SKU free monthly quotas — builder verifies the current SKU names/free tiers on https://developers.google.com/maps/billing-and-pricing/pricing before coding and adjusts field masks so discovery stays on the Pro SKU and refresh on Enterprise + Atmosphere).
- `budget.take(db, sku): Promise<boolean>` (atomic increment if below cap).
- `googlePlaces(env).textSearch({ query, rect, pageToken? })` → `{ places: { id, displayName, location, formattedAddress, businessStatus }[], nextPageToken? }` using `POST https://places.googleapis.com/v1/places:searchText` with `X-Goog-FieldMask`; `.details(placeId)` → `{ rating, userRatingCount, businessStatus, reviews: { name, rating, text, authorAttribution, publishTime }[], photos? }`.
- `runDiscovery(db, env, city)`: tiles from city bbox (row-major), cursor in `sync_cursor['discovery:'+slug]`, `tilesPerRun` tiles × each query (one page), upsert places (`last_seen_at=now`), new ones get `chain` via `chains.ts` and `district` via `districts.ts` (point-in-polygon against `apps/worker/src/sync/districts/lviv.geojson` — six Lviv districts: Галицький, Залізничний, Личаківський, Сихівський, Франківський, Шевченківський; GeoJSON committed from OSM admin_level=9 boundaries, simplified).
- `runRefresh(db, env)`: `refreshPerRun` oldest `google_last_synced_at`; sets rating fields, status mapping `CLOSED_PERMANENTLY→dead(dead_reason 'google_closed')`, `CLOSED_TEMPORARILY→closed_temp`, `OPERATIONAL→open` (unless admin-dead), upserts ≤5 reviews as `external_reviews(source='google')`; flags `dead_candidate=1` per spec §8 step 3.
- `normalizeChainName(name): string` and `assignChain(db, place)` per spec §8 chain detection.

- [ ] **Step 1:** Tests with `fetchMock`: discovery advances cursor and inserts places once (idempotent on re-run); budget at cap → no fetch and `sync_runs` notes `budget_exhausted`; Google 500 → function returns error string, no throw (Review Focus #4); refresh maps CLOSED_PERMANENTLY to dead; two places "Кебаб-Шеф Сихів"/"Кебаб-шеф Личаківська" end up in one chain; point in Sykhiv resolves to `Сихівський`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(sync): google places discovery and refresh`.

### Task 9: Threads sync

**Files:**
- Create: `apps/worker/src/sync/threads.ts`, `apps/worker/test/sync-threads.test.ts`

**Interfaces:**
- `runThreads(db, env, city)`: for each `'<query> <city.name>'` call `GET https://graph.threads.net/v1.0/keyword_search?q=…&search_type=RECENT&fields=id,text,username,permalink,timestamp&access_token=…`; upsert `external_reviews(source='threads', external_id=id)`; link `place_id` when normalised text contains a place's or chain's normalised name (longest match wins); skip when no token → returns `'threads_not_configured'`.
- `refreshThreadsToken(db, env)`: when stored token expires in < 7 days call `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=…`, store new token + expiry in `sync_cursor['threads:token']` (secret is the bootstrap value; DB value wins when newer).
- `GET /api/cities/:slug/feed` includes `threadsStatus: 'ok'|'unavailable'` derived from the last threads sync run.

- [ ] **Step 1:** Tests: posts stored once; "найкраща шаурма на коновальця" links to the Коновальця place; missing token → no fetch, status unavailable; 401 from Graph → status unavailable, run doesn't throw.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(sync): threads mentions`.

### Task 10: Cron orchestration

**Files:**
- Create: `apps/worker/src/sync/run.ts`; Modify: `apps/worker/src/index.ts` (`scheduled`); Test: `apps/worker/test/cron.test.ts`

**Interfaces:**
- `runSync(db, env, kind: 'discovery'|'refresh'|'threads'|'all'): Promise<SyncRunRow>` — opens a `sync_runs` row, runs steps per active city, each step wrapped so one failure doesn't stop the others, records `calls_used`, counts and joined `error`.
- `scheduled(event, env, ctx)`: cron `*/10 * * * *` → `publishDue`; cron `0 * * * *` → `runSync('all')` + `refreshThreadsToken`.

- [ ] **Step 1:** Tests: hourly cron with Google failing and Threads OK still stores threads posts and a run row with error text; 10-min cron publishes due ratings only.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(sync): cron orchestration`.

## Phase D — Web

### Task 11: Angular app shell, design tokens, i18n, API client

**Files:**
- Create: `apps/web/` via `ng new web --standalone --style=scss --routing --ssr=false --skip-git`, then: `src/styles/{tokens.scss,glass.scss,base.scss}`, `src/app/core/{api.service.ts,config.ts,i18n.ts}`, `src/app/app.routes.ts`, `src/assets/i18n/{uk,en}.json`, `src/app/pages/{privacy,not-found}/…`
- Modify: `apps/web/angular.json` (test builder `@angular/build:unit-test`, budgets), root `package.json` scripts (`build` = shared → web → worker).

**Interfaces:**
- Routes: `''` → redirect `lviv`; `':city'` HomePage; `':city/place/:id'` PlacePage; `'me'` MePage (auth guard); `'admin'` AdminPage (admin guard, lazy); `'privacy'`; `'**'` NotFound.
- `ApiService` (signals-friendly, `HttpClient`, base `/api`, adds `X-Requested-With: kebabarium`): `cities()`, `places(city)`, `place(id)`, `feed(city, { since?, source })`, `leaderboard(city, kind)`, `stats(city)`, `near(lat,lng,r)`, `submitReview(placeId, body)`, `me()`, `login(credential)`, `logout()`, `updateMe(patch)`, `myRatings()`, admin methods mirroring Task 7.
- `RuntimeConfig` signal loaded once from `GET /api/config` (Task 4) before the map initialises.
- Tokens from the mockup: `--glass`, `--edge`, fonts Unbounded/Manrope/JetBrains Mono (self-hosted woff2 in `src/assets/fonts`), thin dark scrollbars, `#ff7a00` accent.
- Transloco with `uk` default, `en`, browser detection, persisted `localStorage['kb.lang']`.
- `/privacy` page: what we store (hashed IP prefixes, device cookie, Google profile basics, reviews), Google/Threads attribution, contact email placeholder from config — required for Meta review.

- [ ] **Step 1:** Tests: `ApiService.places('lviv')` hits `/api/cities/lviv/places` with header; language resolves to `en` for `navigator.language='en-US'`, `uk` otherwise; unknown route renders NotFound.
- [ ] **Step 2–4:** fail → implement → pass (`npm -w apps/web test`).
- [ ] **Step 5:** Commit `feat(web): angular shell, tokens, i18n, api client`.

### Task 12: Map layer (Google provider + dev MapLibre provider)

**Files:**
- Create: `apps/web/src/app/map/{map-provider.ts,google-map.provider.ts,maplibre-map.provider.ts,map.component.ts,map.component.html,map.component.scss,emoji-drop.ts,radar.ts,webgl.ts}`, `apps/web/map-style/google-dark-lineart.json`, tests `map/*.spec.ts`

**Interfaces:**
- `interface MapProvider { init(el: HTMLElement, city: City): Promise<void>; setPlaces(p: PlaceSummary[], opts: { dimmedIds?: Set<number> }): void; flyTo(c: LngLat, zoom: number, pitch?: number): Promise<void>; onPlaceClick(cb: (id: number) => void): void; onMapClick(cb: (c: LngLat) => void): void; project(c: LngLat): { x: number; y: number }; metersToPixels(m: number, at: LngLat): number; zoom(): number; pitch(): number; onMove(cb: () => void): void; destroy(): void }`.
- Google provider: `@googlemaps/js-api-loader` with `mapId`, `tilt: 58`, `heading: -18`, `renderingType: VECTOR`, `disableDefaultUI: true`; deck.gl `GoogleMapsOverlay` with `ColumnLayer` (`diskResolution: 4`, `radius: 28`, `extruded: true`, `getElevation = columnHeight × zoomFactor`, `getFillColor = ratingColor`), elevation transition 1600 ms ease-out for the grow-in; labels for top 3 + moved-dead as HTML `AdvancedMarkerElement` pills.
- MapLibre provider: port of the mockup map (OpenFreeMap style layers, `fill-extrusion` with the shared stops).
- `map-style/google-dark-lineart.json`: Google cloud style JSON matching the mockup (background `#0a0a0c`, water `#121216`, parks `#0f1410`, roads minor `#2c2c32`/arterial `#55555e`/highway `#9a9aa4`, all POI/transit/labels off except none) + `docs/DEPLOY.md` section on importing it.
- `EmojiDrop.play(provider, place, emoji, caption)` and `Radar.show(provider, center, radiusKm)` / `.finish()` / `.hide()` as HTML overlays positioned via `project` + `metersToPixels`, re-sized on `onMove` (fixes the zoom bug found in the mockup).
- `webglAvailable(): boolean`; when false HomePage renders a list fallback (Task 13).

- [ ] **Step 1:** Unit tests (providers mocked): `MapComponent` calls `setPlaces` with places from the store; radar diameter equals `2 × metersToPixels(r*1000)` and updates on move; emoji for stars 5/4/3/2/1 = 🤤/😋/🙂/😕/🤢.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Manual check via dev server with `mapProvider='maplibre'` (dev seed) — columns, colours and zoom scaling match the mockup; with a real key the Google map renders the same look. Screenshot both into `docs/superpowers/mockups/`.
- [ ] **Step 6:** Commit `feat(web): map providers with columns, radar and emoji drops`.

### Task 13: Home chrome — navbar, panels, legend, FAB, feed, leaderboard

**Files:**
- Create: `apps/web/src/app/home/{home.page.*}`, `ui/{glass-panel.component.*,pill-dock.component.*,rank-badge.component.ts,score-tile.component.ts,letter-avatar.component.ts,icons.ts}`, `nav/{navbar.component.*,city-picker.component.*}`, `panels/{leaderboard.panel.*,feed.panel.*,legend.component.*}`, `state/{city.store.ts,feed.store.ts,layout.store.ts}`, specs alongside.

**Interfaces:**
- `GlassPanelComponent` inputs `id`, `title`, `icon`, `collapsible`, `draggable`; desktop drag by header (ignore pointerdown on `button,a,input,[data-nodrag]`), clamp to viewport, persist `localStorage['kb.pos.'+id]`; `LayoutStore.reset()` clears all; on ≤560 px panels are bottom sheets, only one open (`LayoutStore.openSheet(id)`), map tap closes.
- Navbar pill: logo mark (three bars SVG from the mockup) + wordmark (hidden ≤560 px), city picker (from `/api/cities`), "Поруч", "Увійти" or avatar → profile menu (Task 16). All 34 px high.
- Leaderboard tabs Місця / Мережі / Райони / Люди; rows: `RankBadge` 1–3 gold/silver/bronze, name ellipsis, value coloured by `ratingColor` (Люди shows count).
- Feed: segmented filter Усі/Наші/Google/Threads; polls `feed(city,{since})` every 15 s (paused when tab hidden); new items enter one by one with a 1.1 s "…typing" bubble; each new item with `placeId` triggers `EmojiDrop` + caption (`"{author} поставив {n}★"`, `"новий відгук з Google · {n}★"`, …); Threads tab shows "Threads тимчасово недоступний" when `threadsStatus==='unavailable'`; Google items show a "Google" badge.
- Legend: gradient from `ratingStops()`, labels 1/3/5, caption key `legend.caption` = "вищий і зеленіший = смачніше"; hidden on phones.
- FAB "Залишити відгук" flat `#ff7a00`, opens review modal (Task 14).
- WebGL unavailable → list view of places sorted by score instead of the map.

- [ ] **Step 1:** Component tests: dragging persists position and "Як було" resets; on 375 px opening Feed closes Leaderboard; leaderboard value colour for 4.8 equals `ratingColor(4.8)`; feed with filter `google` requests `source=google`; a long name is ellipsised in the row (Review Focus #5); no element in the home page has a `box-shadow`/`text-shadow` with a non-neutral colour (scan computed styles of all elements for rgba with non-zero chroma in shadows).
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): home chrome, panels, feed and leaderboard`.

### Task 14: Place card, place page, review modal

**Files:**
- Create: `apps/web/src/app/place/{place-card.component.*,place.page.*,logo-tile.component.ts}`, `review/{review-modal.component.*,turnstile.ts,star-input.component.ts}`, specs.

**Interfaces:**
- Card opens on column click (Google: `InfoWindow`-free custom HTML overlay anchored to the column; MapLibre: popup), closes on ✕ or empty-map click; contents per spec goal 2a; Google reviews carry author attribution + "Google" badge; status line; buttons "Оцінити" (opens modal pre-filled) and "Маршрут" (`https://www.google.com/maps/dir/?api=1&destination=lat,lng&destination_place_id=…`).
- `LogoTile`: `logoUrl` → img; else monogram from name (strip `шаурма|кебаб|doner|на|біля`) on one of the mockup gradients chosen by `id % 5`.
- Review modal per spec §10.3: place autocomplete (client-side over loaded places, open only), 5 big stars + `ratingWord`, text counter /280, nickname (hidden when logged in), Turnstile managed widget (`turnstile.ts` loads `https://challenges.cloudflare.com/turnstile/v0/api.js` once), errors: `cooldown` → "Ти вже оцінював цей заклад. Наступний відгук сюди — через {days} дн.", `rate_limited`, `banned`, network; success toast; bottom sheet ≤560 px; Esc closes; focus trap.
- Place page `/:city/place/:id`: full card + all reviews paginated + move history.

- [ ] **Step 1:** Tests: card renders review text containing `<b>x</b>` as literal text (Review Focus #5); submit with 0 stars shows "Постав оцінку зірками" and sends nothing; 429 cooldown maps to the days message; logged-in user sees no nickname field; logo monogram for "Кебаб-Шеф Сихів" is "ШС".
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): place card, place page and review modal`.

### Task 15: Nearby (GPS + radar)

**Files:**
- Create: `apps/web/src/app/nearby/{nearby.service.ts,nearby.panel.*}`, specs.

**Interfaces:**
- `NearbyService.start()`: `navigator.geolocation.getCurrentPosition` (timeout 8 s, high accuracy) → if denied/timeout/outside every active city bbox → toast "Не вдалося визначити, де ти. Тицьни на мапі, звідки шукати" and enter pick mode (next map click = point); then fly (`zoom {1:14.2,2:13.4,5:12.2}[r]`, pitch 45), `Radar.show` 2.5 s, call `near()`, `Radar.finish()`, dim others via `setPlaces({dimmedIds})`, open panel.
- Panel per spec goal 2 (chips 1/2/5 with `data-nodrag`, auto-widen note, rows with `ScoreTile`, distance m/km, walk min = `km/0.08`, "найкраще поруч", route button, row tap → fly + open card); desktop top-right, phone sheet; close restores columns and hides radar. Opening it does not collapse other panels on desktop.

- [ ] **Step 1:** Tests: geolocation denied → pick mode toast; position outside Lviv bbox → pick mode (Review Focus #2); `autoWidened` response shows the "розширив пошук до 5 км" note; clicking chip "2 км" (real DOM click on the chip inside the draggable header) requests `r=2`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): nearby radar flow`.

### Task 16: Sign-in UI, profile, Me page

**Files:**
- Create: `apps/web/src/app/auth/{auth.store.ts,google-signin.ts,nickname.dialog.*,profile-menu.component.*}`, `me/me.page.*`, specs.

**Interfaces:**
- "Увійти" opens a small glass sheet with the Google Identity Services button (`google.accounts.id.initialize({ client_id, callback })` + `renderButton` theme `filled_black`, shape `pill`); callback → `api.login(credential)`; `needsNickname` → `NicknameDialog` (prefilled `suggestedNickname`, validation per Task 5, 409 → "Такий нікнейм уже зайнятий").
- Profile menu (avatar letter tile in navbar): Мій профіль (`/me`), Мова: Українська/English, "Показувати імʼя та прізвище" toggle, "Сховати мене з лідерборду" toggle, Адмінка (admins), Вийти.
- `/me`: count, personal top (sorted by my stars then combined), timeline with edits; edit/delete own rating.

- [ ] **Step 1:** Tests: GIS callback → login → nickname dialog shown when `needsNickname`; switching language to English persists and re-renders navbar text; non-admin doesn't see "Адмінка".
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): sign-in, profile and me page`.

### Task 17: Boot screen

**Files:**
- Create: `apps/web/src/app/boot/{boot-screen.component.*,boot-timeline.ts}`, spec.

**Interfaces:**
- Shown only on cold start (component in `app.component` before router outlet; flag in `sessionStorage['kb.booted']` is NOT used — every full page load is a cold start; in-app navigation never re-shows it).
- `bootTimeline(stats: CityStats, citySlug)` → steps exactly as spec §5 Loading screen with real numbers (`spots`, `reviews`, `open`, `dead`), "heating up the grill → 230°C" fixed; total ≈ 3.2 s; bar holds at 70 % until `mapReady` signal; hard max 7 s; tap skips; time-driven (`performance.now()` accumulation capped at 1000 ms per frame) — the mockup's v20 algorithm; `prefers-reduced-motion` → show final state instantly then fade after 600 ms. On fade-out emits `done` → map starts the column grow transition.

- [ ] **Step 1:** Tests with fake timers: at t=0 shows typed prefix of the command; steps render real counts from stats; never exceeds 7 s even if `mapReady` never fires; reduced motion shows all lines at once.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): terminal boot screen`.

### Task 18: Admin UI

**Files:**
- Create: `apps/web/src/app/admin/{admin.page.*,places.tab.*,chains.tab.*,moderation.tab.*,bans.tab.*,sync.tab.*}`, specs.

**Interfaces:**
- Tabs: Заклади (search, status filter, dead-candidates filter, inline edit name/chain/district/logo/status, "Переїхав у…" picker → move-to), Мережі (CRUD, logo), Модерація (pending/held lists with identity hints — hashed, never IPs — approve/hide/hide-identity/ban 7d/30d/forever), Бани, Синхронізація (runs table, budget bars per SKU, "Запустити зараз" per kind). Same glass style, desktop-first, usable on phone.

- [ ] **Step 1:** Tests: approve calls `/api/admin/reviews/:id/approve` and removes the row; move-to dialog posts the right ids; budget bar shows `used/cap`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(web): admin panel`.

## Phase E — Ship

### Task 19: Production hardening

**Files:**
- Create: `apps/worker/src/security.ts`, `apps/web/public/{robots.txt,og.png,favicon.svg,manifest.webmanifest}`; Modify: `apps/worker/src/index.ts`; Test: `apps/worker/test/security.test.ts`

**Interfaces:**
- Response headers on all routes: `Content-Security-Policy` allowing self, `maps.googleapis.com`, `maps.gstatic.com`, `*.googleapis.com`, `accounts.google.com`, `challenges.cloudflare.com`, `graph.threads.net` not needed client-side; fonts self; `img-src` self data: `https://*.googleusercontent.com https://maps.gstatic.com https://*.ggpht.com`; `frame-src accounts.google.com challenges.cloudflare.com`; plus `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self)`.
- Request body limit 8 KB on `/api/*` mutations; JSON schema validation with `zod` on every mutating route (400 `validation_error`).
- Structured logs (`console.log(JSON.stringify({...}))`) without IPs/emails.
- Web: meta/OG tags (title "Кебабаріум — найкраща шаурма Львова"), favicon = logo mark, Lighthouse ≥ 90 performance on desktop for the home route with seed data (lazy-load admin, deck.gl and Turnstile only when needed).

- [ ] **Step 1:** Tests: CSP header present on `/` and `/api/health`; 9 KB body → 413; invalid review body → 400 `validation_error`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat: production hardening`.

### Task 20: Deploy to Cloudflare (workers.dev) + runbook

**Files:**
- Create: `docs/DEPLOY.md`, `.dev.vars.example`, `apps/worker/scripts/check-secrets.ts`

**Interfaces:**
- `docs/DEPLOY.md`: owner steps in order — (1) Google Cloud: enable Maps JavaScript API + Places API (New), create server key (API restriction Places) and browser key (HTTP referrer `https://kebabarium.<account>.workers.dev/*` + later the domain), set per-day quotas as a second budget fence, create Map ID (Vector, JavaScript) and import `apps/web/map-style/google-dark-lineart.json`; (2) OAuth client ID (Web, authorised origin = workers.dev URL); (3) Cloudflare Turnstile widget (managed) → site key + secret; (4) Meta app for Threads (use case, permissions, long-lived token, app review with `/privacy` URL); (5) `wrangler secret put` for every secret in spec §6 table; (6) admin emails.
- `npm run check-secrets` lists which secrets are set (`wrangler secret list`) and which are missing; `npm run deploy` = build all → `wrangler d1 migrations apply kebabarium --remote` → `wrangler deploy`.
- Smoke after deploy: `/api/health` 200, `/api/cities` contains lviv, home loads boot screen then map, `POST /api/admin/sync {kind:'discovery'}` adds places.

- [ ] **Step 1:** `wrangler d1 create kebabarium` (owner logged in via `wrangler login`), put `database_id` into `wrangler.jsonc`.
- [ ] **Step 2:** Owner sets secrets (`npm run check-secrets` → all present; Threads may be missing at first — site must still work).
- [ ] **Step 3:** `npm run deploy` → prints `https://kebabarium.<account>.workers.dev`.
- [ ] **Step 4:** Run the smoke checks above; trigger first discovery; verify places appear on the Google map.
- [ ] **Step 5:** Commit `docs: deploy runbook`.
