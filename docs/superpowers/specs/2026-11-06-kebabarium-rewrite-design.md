# Kebabarium — rewrite design (Node + Angular on Cloudflare)

Date: 2026-11-06 · Owner: Oleg (Cavayman) · Status: draft v2 (owner decisions on Google & Threads recorded), awaiting approval

## 1. Intent

Kebabarium is a fan site born out of a deep love for shawarma/kebab. People should be able to:

- open the site and immediately see **their city (Lviv first)** as a stylish dark, line-drawn map where every kebab spot is a **3D column — the better the rating, the taller and "hotter" the column**;
- find a good kebab **near them**;
- see **fresh reviews and mentions** streaming in (our users, Google, Threads);
- see **leaderboards** — best spots, best chains, best districts, most active tasters;
- **rate spots — even without logging in** (anonymous review with anti-spam protection), and once logged in keep a **personal history / personal ranking** of what they've eaten.

It is a fun project, not a business. The vibe matters as much as the features: **youth-friendly and simple**, like a modern social app — rounded friendly type, clean line icons, chat-bubble feed, playful micro-animations — inside **frosted-glass "Apple Pro" panels** over a dark line-art map with glowing rating columns. (An earlier "cyber-terminal" direction was explored and dropped by the owner as too nerdy.)

Why now: the 2019 Java/Angular 6 version is a static stub that no longer builds on modern JDK/Node. The owner wants to drop Java entirely and rebuild on Node + Angular, deployed to Cloudflare so it can be tried and used by friends.

## 2. Goals

1. Public, no-login home page = map of the selected city with rating columns, live review feed, leaderboard (mockup: `docs/superpowers/mockups/home.html`).
2. **"Поруч" (nearby)**: asks for GPS; the map flies to the user (zoom ~13.7, tilted), draws a **radar scan** around them (orange disc of the search radius, rotating sweep, expanding rings, glowing "you" dot) for ~2.5 s, then dims columns outside the radius and opens a **"Поруч з тобою" window** (desktop: top-right, other open panels stay as they are — users may have several windows open; phone: bottom sheet): spots within the radius, **radius chips 1 / 2 / 5 km; default 1 km, auto-widened to 2 then 5 km when fewer than 3 open spots are found, with a note "розширив пошук до N км"**; the radar circle is always drawn to the real radius and rescales with zoom/pan; best rating first, each with score tile, name, distance and walking minutes, "найкраще поруч" badge on #1, and a route button; tapping a row flies to the spot and opens its card. If GPS is denied/unavailable: tell the user and fall back to manual (tap on the map to set a point). The window is draggable/closable like the others; closing it restores all columns.
2a. **Click/tap** a column → glass detail card that stays open until closed (✕ or click on empty map; no hover flicker): place **logo**, name, chain (if any), combined / ours / Google score, review count, a scrollable list of the latest ~5 reviews (ours + Google, source-marked), open/closed status, buttons "★ Оцінити" and "Маршрут".
3. **Anyone can leave a review** (1–5 stars + optional text ≤ 280 chars + optional nickname) via a "Відгук" button in the navbar or "Оцінити" on a place card — **no login required**. Anonymous reviews go through the anti-abuse rules in §8b and weigh less. Logged-in users' ratings count fully, can be edited, and build their own history and personal top list.
4. Backend database refreshed **automatically every hour** with new places, updated Google ratings/status, and fresh reviews/mentions.
5. Spots that are permanently closed or long-inactive are marked **dead** (grey column, "не працює").
6. **Chains**: each spot is stored individually, optionally linked to a chain; chain score = average of its spots.
7. **Moved / reopened spots** (e.g. "Patona → Konovaltsya") can be linked so history and ratings carry over.
8. **Admin panel** (admin-only): manage places, chains, merges/moves, dead flags, hide abusive reviews, trigger a sync, see sync log.
9. **City selector** in the navbar; data model is multi-city from day one, Lviv is the only seeded city at launch.
10. Deployed on Cloudflare, reachable on a public URL.

## 3. Non-goals (for v1)

- Ordering/delivery, payments, Glovo integration (no public API; scraping violates their terms).
- Native mobile apps. The web app must work well on phones, nothing more.
- Social features beyond ratings (follows, comments on reviews, DMs).
- Moderation workflow beyond admin hide/delete.

## 4. Anti-goals (would be a failure even if it "works")

- Looks like a generic Bootstrap/Google-Maps page. The dark line map + glowing columns + glass + terminal vibe is the product.
- Columns that all look the same height. Rating differences between 4.6 and 4.8 must be visible at a glance.
- Running up a surprise Google Cloud bill. External API usage must stay within free tiers by default, with hard caps.
- Fake data shown as real. Mock data is allowed only in local dev/seed, never in production.

## 5. Decisions already made (by the owner)

- **Stack**: Node (TypeScript) backend + Angular frontend. No Java.
- **Hosting**: Cloudflare.
- **Places/ratings source**: Google Maps (Places API).
- **Feeds**: fresh reviews from our users + Google; Threads mentions are wanted.
- **Combined score** per spot: average of our score and Google score; if we have no ratings yet → Google score only (and vice versa).
- **Visuals** (from the mockup sessions):
  - dark theme, orange accent; map is line-art (streets only, no fills/labels clutter);
  - 3D extruded columns; height on a stretched, progressive scale starting at 3.0 (below 3 = short stub); **height also scales down with zoom** so columns stay readable when zoomed in;
  - the legend's gradient spans the full 3.0–5.0 range with the same colour stops as the columns, caption "вищий і яскравіший = смачніше";
  - colour by rating = **"Ember" palette** (owner pick): how "hot" a spot is — cold ash `#3d3631` (1) → `#6e5a48` (3.0) → amber `#b8742e` (3.8) → orange `#ff8a1f` (4.3) → `#ffb32e` (4.6) → glowing gold `#ffd75e` (4.9+); top spots also get a soft glow; **no pure red, no pure white**; dead spots dark grey; the same scale colours columns, score tiles, leaderboard numbers and the legend;
  - frosted glass panels (blur + translucency), friendly rounded fonts (mockup: Unbounded for headings/logo, Manrope for text), columns grow on load;
  - **emoji used sparingly** — only in the review-drop animation; UI chrome uses thin line icons (pin, navigate arrow, trophy, chat), letter avatars, gold/silver/bronze rank badges, ★ for stars; too many emoji looked childish;
  - all navbar controls have the same height; logo is an orange rounded-square mark with three bars + wordmark;
  - on desktop the leaderboard and feed panels are **draggable like windows** (grab the header / ⋮⋮ grip), positions are remembered per browser (localStorage), and a "Як було" pill resets the default layout; the default layout is the mockup's;
  - leaderboard and feed panels are **collapsible** (− button) into small pills at the bottom; **on phones they start collapsed** and open as bottom sheets one at a time, so the map stays uncluttered; tapping empty map closes them; legend hidden on phones;
  - **compact pill navbar** centred at the top, only as wide as its contents: logo, city picker, "Поруч", "Увійти" (no language switch here); on narrow screens the wordmark collapses to the logo mark;
  - **"Залишити відгук" is a big orange floating button pinned bottom-centre** (always visible, desktop and phone); the collapsed-panel pills sit just above it;
  - live feed has a **source filter**: Усі / Наші / Google / Threads (segmented control; default Усі); it looks like a **chat**: letter avatar, name, source badge (наш / Google / Threads), stars, place name, text; a "…typing" bubble appears before each new message;
  - thin dark scrollbars everywhere (no default white ones);
  - **no scrolling ticker** (removed at owner request);
  - when a new review arrives, its emoji (🤤 😋 🔥 🤢 … chosen by rating) **falls from above into that place's column** with a small ring burst, plus a **short caption pill** saying what happened ("oleg поставив 5⭐", "новий заклад на мапі ✨", "ой… 2⭐ від Google") — pure eye candy;
  - click-to-open detail card with logo + recent reviews; leaderboard panel with tabs (spots / chains / districts / tasters);
  - city picker in navbar.

### Loading screen

On a cold start the app shows a black/ember boot screen: an animated doner spit (meat layers scrolling sideways so it looks like it turns, flickering ember glow and sparks underneath), the "кебабаріум" wordmark, an ember-gradient progress bar and rotating captions ("розпалюємо гриль…", "крутимо шаурму…", "рахуємо найсмачніші…"). It stays at least ~1.8 s, at most 6 s, fades out when the map and first data are ready, and only then the columns grow. Respects `prefers-reduced-motion`. Not shown on in-app navigation.

## 6. Architecture (builder's proposal, my call — owner can override)

One Cloudflare **Worker** serves everything:

| Piece | Choice | Why |
|---|---|---|
| API | TypeScript on Cloudflare Workers (`nodejs_compat`), **Hono** router | "Node" in spirit, native to Cloudflare, tiny |
| DB | **Cloudflare D1** (SQLite) with SQL migrations via `wrangler d1 migrations` | free tier is plenty, zero ops |
| Hourly sync | **Cron Trigger** `0 * * * *` on the same Worker | built-in, no extra infra |
| Frontend | **Angular** (current major, standalone components, signals), built to static files and served via **Workers Static Assets** from the same Worker (SPA fallback to `index.html`) | one deploy, same origin, no CORS |
| Map | **Google Maps JavaScript API, vector map** with a cloud-based **dark line-art map style** (Map ID; roads only, no POI/labels clutter, parks very subtle), tilt + heading enabled; 3D columns, radar and emoji drops drawn with **deck.gl `GoogleMapsOverlay`** (ColumnLayer / custom layers) or `WebGLOverlayView` | **owner decision (option A)**: Google ratings/reviews may only be shown on a Google map, so the base map is Google's, styled to match the mockup (which was built on MapLibre/OpenFreeMap). **First task of the plan is a spike** proving the look (line-art, tilt, glowing columns, radar) on Google Maps before building on it |
| Auth | **Google Sign-In** (Google Identity Services ID token) verified in the Worker → our own session cookie (signed JWT, HttpOnly, SameSite=Lax) | everyone has Google; no passwords stored |
| Admin | users whose email is in `ADMIN_EMAILS` secret get role `admin`; admin UI is an Angular route `/admin` guarded client-side and **enforced server-side** | simple |
| Secrets | `wrangler secret`: `GOOGLE_PLACES_KEY` (server), `GOOGLE_MAPS_BROWSER_KEY` + `GOOGLE_MAP_ID` (public, HTTP-referrer restricted), `GOOGLE_OAUTH_CLIENT_ID`, `SESSION_SECRET`, `IP_HASH_SECRET`, `TURNSTILE_SECRET`, `ADMIN_EMAILS`, `THREADS_APP_ID`/`THREADS_APP_SECRET`/`THREADS_TOKEN` | |

Repo layout (replaces the Java modules, which are deleted):

```
/apps/web        Angular app
/apps/worker     Hono API + cron sync + D1 migrations
/packages/shared shared TS types (DTOs)
/docs            this spec, mockups
```

## 7. Data model (D1)

- `cities(id, slug, name, center_lat, center_lng, zoom, bbox_json, active)`
- `chains(id, city_id NULL, name, slug)` — chain score computed (avg of member spots' combined score).
- `places(id, city_id, logo_url NULL, google_place_id UNIQUE NULL, name, address, lat, lng, district, chain_id NULL, status ENUM('open','closed_temp','dead','hidden'), dead_reason, moved_to_place_id NULL, google_rating, google_rating_count, google_last_synced_at, created_at, updated_at)`
- `ratings(id, place_id, user_id NULL, nickname NULL, stars 1–5, text NULL, is_anonymous, weight REAL, status ENUM('pending','published','held','hidden'), publish_at, ip_hash, ip_prefix_hash, device_id, created_at, updated_at)` — logged-in: one active rating per user per place (partial UNIQUE(place_id,user_id) where user_id not null), editing updates it and previous values go to `rating_history`; anonymous: see §8b. Raw IPs are never stored.
- `abuse_bans(id, kind ENUM('ip_prefix','device','user'), value_hash, reason, until, created_by)`
- `rating_history(id, rating_id, stars, text, changed_at)`
- `external_reviews(id, place_id NULL, source ENUM('google','threads'), external_id UNIQUE, author, text, stars NULL, url, published_at, fetched_at)`
- `users(id, google_sub UNIQUE, email, nickname UNIQUE, first_name, last_name, show_real_name BOOL DEFAULT false, hide_from_leaderboard BOOL DEFAULT false, avatar_url, role ENUM('user','admin'), created_at)` — **owner decision: people are shown by nickname**; on first login the user picks a nickname (pre-filled from their Google first name); they may opt in to show first + last name instead.
- `sync_runs(id, started_at, finished_at, kind, calls_used, places_added, places_updated, marked_dead, error)`

Derived (computed in SQL views or at query time):
- **our score** = weighted avg(stars) of `published` ratings (weight 1.0 logged-in, 0.5 anonymous);
- **combined score** = avg(our, google) if both, else whichever exists;
- **chain score** = avg combined of non-dead member spots;
- **district score** = avg combined of non-dead spots in district (district from reverse geocoding or polygon lookup — builder's choice);
- **taster leaderboard** = users by number of ratings.

Moves/merges: `moved_to_place_id` links an old (dead) place to the new one; the new place's "our score" and detail card include ratings of the whole move chain; history shows them with the old address.

## 8. Hourly sync (budget-aware)

Runs from the Cron Trigger. Every run:

1. **Discovery** (new places): Places API (New) Text Search for "шаурма", "кебаб", "doner", "шаверма" over a grid of tiles covering each active city; each run processes the **next N tiles** in rotation (not the whole city), so a full city sweep takes ~a day.
2. **Refresh**: for the M oldest-synced places, fetch rating, rating count, `businessStatus`, and up to 5 reviews.
3. **Dead detection**: `CLOSED_PERMANENTLY` → `dead`; `CLOSED_TEMPORARILY` → `closed_temp`; a place not returned by discovery for 30 days *and* without any rating activity for 180 days → flagged `dead?` for admin review (not auto-hidden).
4. **Threads** — **owner decision: part of the launch.** Keyword search (Threads API `keyword_search`, needs the `threads_keyword_search` permission on the owner's Meta app) for the same terms + city name (e.g. "шаурма львів", "кебаб львів", "шаверма"), most recent first; store matches as `external_reviews(source='threads')` with author handle, permalink, text, published_at; link to a place when the post text matches a place/chain name (best effort, admin can fix); posts that can't be linked still appear in the city feed. Rate-limit aware; skip silently if the token is missing/expired and show a small "Threads тимчасово недоступний" note in the Threads tab.
   Setup the owner does in the Meta developer portal (no connector available to automate it): create/choose the app, add the Threads use case, request `threads_basic` + `threads_keyword_search`, generate a long-lived token (stored as `THREADS_TOKEN` secret, refreshed automatically before expiry by the cron). Meta's app review for `threads_keyword_search` needs the live public URL, a privacy policy page and a short screencast — so the site ships with a `/privacy` page, and **until approval is granted keyword search only returns the token owner's own posts**; the integration is fully built and switches to public results as soon as the permission is approved, with no code change.
5. Write a `sync_runs` row; ticker events are derived from it.

**Budget guard**: N and M are configured so the monthly call count stays inside Google's free monthly caps per SKU (owner's account); a hard monthly counter in D1 stops calls once a configurable cap is reached. Exact numbers are left to the builder after checking current Google pricing.

Chain detection: on insert, normalise the name (lowercase, strip punctuation/"шаурма"/"kebab" suffixes); if it equals an existing chain name or matches another place's normalised name, link to that chain (create chain if two places match). Admin can fix.

## 8b. Anti-abuse for reviews (my proposal — owner asked for IP/place cooldowns so one "Sykhiv hater" can't spam)

Goal: anonymous reviews are easy for real people and expensive for a spammer; a single person can't move a place's score.

1. **Bot gate**: every anonymous submission requires a valid **Cloudflare Turnstile** token, verified server-side.
2. **Who is "the same person"** without storing IPs: `ip_hash` = HMAC(secret, IP), `ip_prefix_hash` = HMAC of the /24 (IPv4) or /64 (IPv6) prefix, `device_id` = random id in an HttpOnly cookie; logged-in → `user_id`. The HMAC secret rotates monthly; raw IPs are never written anywhere.
3. **Per-place cooldown**: one review per place per **7 days** per identity (any match on user_id, device_id or ip_hash counts). The API answers `429 {retryAfter}`; the modal shows a friendly message.
4. **Global rate limits** (Workers Rate Limiting binding or D1 counters): anonymous — max **3/hour and 10/day per ip_prefix_hash**; logged-in — max 30/day.
5. **Burst guard per place**: if a place receives **≥ 3 anonymous reviews within 1 hour**, further anonymous reviews for it go to `held` (not shown, not counted) until an admin approves.
6. **Hater pattern**: if one identity (or ip prefix) gives **≤ 2★ to ≥ 3 different places in the same district or chain within 24 h**, its new reviews are `held` and the earlier ones are re-flagged for review. Same for the mirror case (≥ 3 × 5★ to one chain).
7. **Content checks**: ≤ 280 chars, no links, simple profanity/slur list → `held`.
8. **Soft publishing**: anonymous reviews are `pending` for ~10 minutes (time for the checks above to fire), then auto-`published` unless held. The author sees their own review immediately (matched by device_id), so being held isn't obvious to a spammer.
9. **Weight**: anonymous = 0.5, logged-in = 1.0 in "our score".
10. **Admin tools**: queue with approve/hide, ban by ip prefix/device/user with expiry, one-click "hide everything from this identity".

Thresholds live in config so they can be tuned without code changes.

## 9. API (sketch)

Public:
- `GET /api/cities`
- `GET /api/cities/:slug/places` → GeoJSON-ready list with scores, status, chain
- `GET /api/places/:id` → details, recent ratings, external reviews, move chain
- `GET /api/cities/:slug/feed?since=` → merged recent ratings + external reviews
- `GET /api/cities/:slug/leaderboard?kind=spots|chains|districts|tasters`
- `GET /api/cities/:slug/stats` → counts, avg, top, dead count, last sync
- `GET /api/places/near?lat=&lng=&r=`

Public with anti-abuse (§8b):
- `POST /api/places/:id/reviews` — body `{stars, text?, nickname?, turnstileToken}`; works with or without a session; returns `published | pending` and, on cooldown, `429` with `retryAfter`

Authenticated:
- `POST /api/auth/google` (ID token → session cookie), `POST /api/auth/logout`, `GET /api/me`
- `PUT /api/places/:id/rating`, `DELETE /api/places/:id/rating` (edit/delete own rating)
- `GET /api/me/ratings` (history + personal top)

Admin:
- CRUD `places`, `chains`; `POST /api/admin/places/:id/move-to/:otherId`; `POST /api/admin/places/:id/status`; `POST /api/admin/ratings/:id/hide`; - `POST /api/admin/sync` (run now); `GET /api/admin/sync-runs`.
- Feed: `GET /api/cities/:slug/feed?since=&source=all|ours|google|threads`.
- Moderation: `GET /api/admin/reviews?status=pending|held`, `POST /api/admin/reviews/:id/approve|hide`, `POST /api/admin/bans`, `DELETE /api/admin/bans/:id`.

## 10. Frontend screens

1. **Home / map** (`/:city`, default `/lviv`) — exactly the mockup (`docs/superpowers/mockups/home.html`): pill navbar, leaderboard panel (🥇🥈🥉, tabs Місця / Мережі / Райони / Люди), rating legend, chat-style live feed, click-to-open detail card, emoji-drop + caption animation on new reviews. No stats strip, no ticker. On mobile: map full-screen, panels become a swipeable bottom sheet.
2. **Place page** (`/:city/place/:id`) — full detail card, all ratings, Google reviews (with attribution), move history, rate button.
3. **Review modal** — place autocomplete (pre-filled when opened from a place card), 5 big stars with a word (погано … топ!), optional text with counter, optional nickname, invisible/managed Cloudflare Turnstile, a hint that logging in makes ratings count fully, friendly cooldown errors ("наступний відгук сюди — через N днів"). Bottom sheet on phones.
4. **Me** (`/me`) — my ratings timeline, my personal top, count/badges.
5. **Admin** (`/admin`) — tables for places/chains, dead-candidates queue, merge/move tool, **review moderation queue (pending/held) + bans**, sync log + "run now".

Live feel: feed polls `/feed?since=` every ~15 s and types new entries; no WebSockets needed in v1.

## 11. Constraints

- Cloudflare free/paid-starter limits (Worker CPU time per cron run; D1 size) — sync must be chunked.
- Google Maps Platform terms (owner chose option A — Google base map): Google ratings/reviews are shown on a Google map with required attribution ("Google" badge on Google-sourced content, author attribution on reviews). Storage: place IDs may be stored indefinitely; other Places content is treated as a short-lived cache that the rotation in §8 refreshes, and is never exported or shown on a non-Google map. The builder must re-check the current Places API policies (caching, attribution, review display) before implementing and adjust TTLs to match.
- Google costs: Maps JS map loads, Places discovery/refresh and photos all bill per SKU; every external call goes through the budget guard (§8). Map loads: one per page view (no reloads on navigation inside the SPA).
- **Two UI languages from v1: Ukrainian (default) and English** — picked automatically from the browser language, changeable in the profile/settings menu (not in the navbar), choice remembered; all strings in i18n files. User-written reviews are shown as written (no translation). Code and identifiers in English.
- Works on current Chrome/Safari/Firefox desktop + mobile; WebGL required for the map (show a fallback list if WebGL is unavailable).

**Place logos**: admin can upload/set a logo URL per place or chain (chain logo is inherited by its spots); otherwise use the first Google place photo if the chosen Google option allows it (budget-capped), else a generated monogram tile (initials on a gradient) as in the mockup.

## 12. Left to the builder

Component library (none required — custom glass CSS is fine), state management details, exact column scale constants and colour stops (start from the mockup), grid size for discovery, district resolution method, test strategy, CI, exact Angular version (latest stable).

## 13. Owner decisions log

- **Google terms** → option A: Google base map styled like the mockup, Google ratings/reviews kept, combined score as specified.
- **Public names** → nickname by default (picked on first login, pre-filled from Google first name); optional real first + last name; can hide from the taster leaderboard. Anonymous reviewers can sign with an optional nickname.
- **Threads** → in the launch (see §8 step 4 for the Meta app-review caveat).
- **Style** → youth-friendly, simple, few emoji; cyber-terminal look dropped.
- **Anonymous reviews** → allowed, protected per §8b.

## 14. What the owner must provide (blocking for deploy, not for building)

1. Google Cloud project with billing enabled: Maps JavaScript API, Places API (New); a server key and a referrer-restricted browser key; a Map ID with the dark style (builder supplies the style JSON).
2. Google OAuth client ID (Web) for sign-in.
3. Cloudflare account access for `wrangler login` (Workers, D1, Turnstile).
4. Meta developer app for Threads + the app-review submission once the site is live.
5. The list of admin emails.
