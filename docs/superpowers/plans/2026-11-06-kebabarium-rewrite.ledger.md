# SDD ledger — plan: docs/superpowers/plans/2026-11-06-kebabarium-rewrite.md

Spec: docs/superpowers/specs/2026-11-06-kebabarium-rewrite-design.md (approved)
Executor: inline (executing-plans), owner chose Native.

## Pre-flight (shared interfaces)
- T2→T4/T6/T7/T8: db/* row types & functions consumed by routes/sync — consistent (all take `db` first).
- T3→T4/T12/T13/T14: shared scale/scoring/types — consistent names (ratingColor, ratingStops, columnHeight, zoomFactor, ourScore, combinedScore).
- T4 /api/config → T11 RuntimeConfig — moved into T4 during self-review; consistent.
- T6 own-pending items → T4 feed/place detail: T4 must accept an optional requester identity; T6 extends T4's services. Ruling below.
- T10 runSync → T7 POST /api/admin/sync: T7 is implemented before T10. Ruling below.
- T12 MapProvider → T13/T14/T15 consumers — consistent.
- T17 boot → T12 map "grow" trigger: T12 must expose `growColumns()`; Ruling below.

Pre-flight: Ruling: T6 adds an optional `viewer` ({deviceId,userId}) param to T4's feed/place services rather than T4 knowing about it — keeps T4 shippable alone — cost if wrong: one signature change.
Pre-flight: Ruling: T7's /api/admin/sync calls a `runSync` stub until T10 replaces it (T10 owns the real implementation; T7 test asserts 202 + a sync_runs row) — cost if wrong: one test update in T10.
Pre-flight: Ruling: MapProvider gets `growColumns(): void` (columns start at height 0 until called) so the boot screen controls when they grow — spec says columns grow after fade — cost if wrong: interface addition.

## Tasks
Task 1: Ruling: compat date 2026-08-20 instead of plan's 2026-11-01 — workerd bundled with vitest-pool-workers 0.23 supports only up to 2026-08-22, tests and prod must share one date — cost if wrong: none functional, bump later
Task 1: complete (commits 3f8b4fe..c6289cd, tests: npm test →    Duration  784ms (transform 109ms, setup 181ms, import 12ms, tests 9ms, environment 0ms))
Task 2: Ruling: added `external_reviews.city_id` (not in spec §7) — unlinked Threads posts still need a city for the feed — cost if wrong: one column
Task 2: Ruling: dev seed has 13 places (plan said 12) — added a place with no Google and no ratings to exercise Review Focus #1 — cost if wrong: test count only
Task 2: Ruling: db functions are added in the task that first consumes them (Task 2 ships cities/places/ratings/budget) — YAGNI — cost if wrong: none
Task 2: complete (commits c6289cd..e505bb6, tests: npm test →    Duration  1.01s (transform 203ms, setup 332ms, import 48ms, tests 59ms, environment 1ms))
Task 3: complete (commits fa92a61..fe77c79, tests: npm test →    Duration  1.02s (transform 215ms, setup 343ms, import 50ms, tests 62ms, environment 1ms))
Task 4: Ruling: near auto-widens only when `r` is omitted; an explicit r (chip click) is respected — spec: chips are a manual choice, auto-widen is the default flow — cost if wrong: one param
Task 4: Ruling: in production /api/config always says mapProvider=google even without a key — Global Constraint: MapLibre never in prod — cost if wrong: blank map until keys are set (intended)
Task 4: Ruling: reviewCount = our published count + Google userRatingCount — card shows total opinions — cost if wrong: label only
Task 4: complete (commits fe77c79..4d0ee43, tests: npm test →    Duration  1.43s (transform 447ms, setup 773ms, import 63ms, tests 194ms, environment 1ms))
Task 5: Ruling: TEST_GOOGLE_JWKS binding lets tests sign Google-like ID tokens; worker honours it only when ENVIRONMENT=dev — no other way to integration-test GIS tokens — cost if wrong: misconfigured prod with ENVIRONMENT=dev would trust a custom JWKS (deploy runbook sets production)
Task 5: Ruling: zod pulled forward from Task 19 into a shared `body()` validator — avoids rewriting every route later — cost if wrong: none
Task 5: Ruling: login rejects Google tokens with email_verified=false — spec silent, admin role is email-based so unverified emails must not count — cost if wrong: rare users cannot sign in
Task 5: complete (commits 4d0ee43..809d224, tests: npm test →    Duration  2.73s (transform 2.79s, setup 5.07s, import 160ms, tests 361ms, environment 0ms))
Task 6: Ruling: monthly HMAC rotation also rotates ban hashes — an ip_prefix ban effectively lasts until month end; device/user bans persist — spec mandates monthly rotation and no raw IPs — cost if wrong: re-ban persistent spammers monthly (admin can ban by device)
Task 6: Ruling: logged-in second post on the same place edits (history row) instead of 429; edits are not subject to cooldown — spec §9 "update their rating" — cost if wrong: none
Task 6: Ruling: hater pattern counts device OR ip-prefix OR user, groups by district and by chain separately; mirror case = ≥3 places of one chain with 5★ — spec §8b.6 — cost if wrong: thresholds in config
Task 6: Ruling: held reviews return status "pending" to the author (spec §8b.8: spammer must not notice) — cost if wrong: none
Task 6: complete (commits 809d224..df0df75, tests: npm test →    Duration  3.68s (transform 4.55s, setup 8.19s, import 243ms, tests 943ms, environment 0ms))
Task 7: Ruling: bans are created from a review (ratingId + kind) rather than raw hashes — admin never sees/needs full hashes, UI only shows 8-char prefixes — cost if wrong: one extra endpoint later
Task 7: Ruling: CAPS/SYNC config pulled forward into sync/config.ts (owned by Task 8) because /admin/budget needs caps — cost if wrong: none
Task 7: complete (commits df0df75..332657e, tests: npm test →    Duration  4.14s (transform 6.05s, setup 11.21s, import 327ms, tests 1.23s, environment 0ms))
Task 8: Ruling: districts by nearest district centre, not OSM polygons — Overpass returned 502/timeouts repeatedly; spec leaves method to builder; admin can correct — cost if wrong: some border places in the neighbour district
Task 8: Ruling: tilesPerRun counts (tile, query) pairs = 6 Google calls/run, not 6 tiles x 4 queries — keeps text search ≈4.5k/month under the free tier; a full Lviv sweep takes ~3.5 days instead of the spec's ~1 day — cost if wrong: slower discovery (tunable in sync/config.ts)
Task 8: Ruling: discovery never imports places that are already CLOSED_PERMANENTLY — they would only add grey stubs — cost if wrong: none
Task 8: complete (commits 332657e..27dd6d6, tests: npm test →    Duration  4.49s (transform 7.02s, setup 13.46s, import 497ms, tests 1.45s, environment 2ms))
Task 9: Ruling: 2 Threads keyword searches per hourly run (not 4), rotating queries; monthly cap 1800 — Threads allows ~500 keyword searches per rolling 7 days — cost if wrong: fewer mentions (tunable)
Task 9: Ruling: the refreshed long-lived Threads token is stored in D1 sync_cursor and wins over the THREADS_TOKEN secret — Workers cannot rewrite their own secrets — cost if wrong: token readable by anyone with D1 access (owner only)
Task 9: complete (commits 27dd6d6..652c431, tests: npm test →    Duration  4.76s (transform 7.69s, setup 15.84s, import 615ms, tests 1.67s, environment 0ms))
Task 10: complete (commits 652c431..7829b8f, tests: npm test →    Duration  5.65s (transform 9.32s, setup 20.22s, import 708ms, tests 1.84s, environment 1ms))
Task 11: Ruling: i18n JSON lives in apps/web/public/i18n (Angular 22 serves public/, not src/assets) — cost if wrong: path only
Task 11: Ruling: routes for home/place/me/admin are added in the tasks that create those pages; Task 11 ships redirect, privacy and 404 — cost if wrong: none
Task 11: Ruling: privacy contact is a placeholder hello@kebabarium.app until the owner buys a domain — owner email must not be published without consent — cost if wrong: owner edits one line (noted in DEPLOY.md)
Task 11: complete (commits 7829b8f..ae3b7df, tests: npm test →    Duration  5.38s (transform 9.09s, setup 19.29s, import 782ms, tests 1.89s, environment 0ms))
Task 12: Ruling: overlays (labels, radar, emoji drop) are provider-agnostic HTML positioned via MapProvider.project/metersToPixels/columnHeightPx instead of Google AdvancedMarkers/MapLibre markers — one implementation, and the radar rescales on move (mockup bug) — cost if wrong: none
Task 12: Ruling: Google provider projects through deck.gl's synced viewport (private `_deck`) for tilt-correct overlay positions — Google OverlayView projection ignores tilt — cost if wrong: overlays misplaced if deck internals change (pinned ^9.4)
Task 12: Ruling: Google zoom = MapLibre zoom + 1 (256 vs 512 px tiles) so the same city zoom/scale constants work on both — cost if wrong: camera framing slightly off
Task 12: Ruling: manual visual check vs mockup moved to Task 13 (MapComponent is not routed until the home page exists) — cost if wrong: none
Task 12: complete (commits ae3b7df..9e7d00d, tests: npm test →    Duration  5.27s (transform 8.92s, setup 19.07s, import 696ms, tests 1.86s, environment 0ms))
Task 13: Ruling: the "no coloured shadows" rule is enforced by a static scan of apps/web/src styles in packages/shared/test/web-style-rules.test.ts instead of computed-style checks — jsdom does not compute component stylesheet shadows — cost if wrong: inline styles set at runtime are not covered
Task 13: Ruling: feed panel stays mounted (hidden) when collapsed so emoji drops keep playing on phones where panels start collapsed — cost if wrong: one poll every 15 s while hidden (paused when the tab is hidden)
Task 13: Ruling: MapLibre worker files are copied into public/maplibre by a prebuild script (Angular forbids assets outside the workspace) — dev-only engine — cost if wrong: none
Task 13: Ruling: wrangler env.dev repeats d1_databases and disables crons (bindings are not inherited) — cost if wrong: none
Task 13: complete (commits 9e7d00d..60a05bb, tests: npm test →    Duration  5.37s (transform 8.82s, setup 19.06s, import 678ms, tests 1.79s, environment 1ms))
Task 14: Ruling: minimal AuthStore (me signal + load) created here because the review modal must hide the nickname for logged-in users; Task 16 extends it — cost if wrong: none
Task 14: Ruling: place page shows up to 50 latest reviews via GET /api/places/:id?limit=50 instead of paginated "all reviews" — enough for a fan site; pagination can come later — cost if wrong: very popular spots show only the latest 50
Task 14: Ruling: the place card anchors next to the column top on desktop and follows camera moves via a new MapComponent `moved` output; on phones it is a bottom sheet — cost if wrong: none
Task 14: complete (commits 60a05bb..95cd2e2, tests: npm test →    Duration  5.87s (transform 8.94s, setup 19.52s, import 676ms, tests 2.03s, environment 3ms))
Task 15: Ruling: NearbyHost.setLit(ids) names the set of columns that stay lit (the page derives the dimmed set) — clearer than "dimmed" — cost if wrong: none
Task 15: Ruling: positions outside every active city bbox are treated like "no GPS" and switch to tap-to-pick (Review Focus #2) — cost if wrong: none
Task 15: complete (commits 95cd2e2..019ca6b, tests: npm test →    Duration  5.40s (transform 8.85s, setup 19.08s, import 666ms, tests 1.84s, environment 1ms))
Task 16: Ruling: language choice is saved to the profile (PATCH /api/me lang) when logged in and restored on login, in addition to localStorage — spec: "choice remembered" — cost if wrong: none
Task 16: Ruling: the login sheet also carries the UA/EN switch so anonymous visitors (who have no profile menu) can change language — spec keeps it out of the navbar only — cost if wrong: one extra control in the sheet
Task 16: complete (commits 019ca6b..30e8772, tests: npm test →    Duration  5.33s (transform 8.75s, setup 18.85s, import 691ms, tests 1.78s, environment 0ms))
Task 17: Ruling: boot screen lives in the home page behind a root BootState flag (shown once per full load) instead of app.component — it needs the city stats and the map-ready signal; non-home cold loads (/privacy, /me) skip it — cost if wrong: none
Task 17: complete (commits 30e8772..1efb7bc, tests: npm test →    Duration  5.83s (transform 8.99s, setup 19.74s, import 661ms, tests 1.94s, environment 2ms))
Task 18: Ruling: bans live inside the Moderation tab (ban from a review) rather than a separate Bans tab — bans are always created from a review — cost if wrong: none
Task 18: complete (commits 1efb7bc..6a2fd1f, tests: npm test →    Duration  5.89s (transform 9.21s, setup 20.20s, import 689ms, tests 1.97s, environment 0ms))
Task 19: Ruling: SPA security headers ship in apps/web/public/_headers (static assets bypass the Worker; run_worker_first is /api/* only); API responses get a stricter default-src none CSP from middleware — cost if wrong: none
Task 19: Ruling: script-src keeps unsafe-eval for Google Maps JS (Google's documented allowlist CSP requires it) and Angular critical-CSS inlining is disabled so no inline scripts are needed — cost if wrong: slightly later first paint of CSS
Task 19: Ruling: no og:image yet (needs a designed 1200x630 image; twitter card "summary") and Lighthouse >=90 was not measured in this environment — cost if wrong: plain link previews; perf unverified (admin, Google/deck.gl, MapLibre, Turnstile and GIS are all lazy-loaded)
Task 19: complete (commits 6a2fd1f..88629bd, tests: npm test →    Duration  5.93s (transform 9.68s, setup 22.13s, import 761ms, tests 1.90s, environment 2ms))
Task 20: Ruling: production falls back to the open MapLibre map only while NO Google key exists (no Google content can be in D1); supersedes the Task 4 rule "prod always google" — lets the owner deploy and click around before buying keys — cost if wrong: none (Google content and the open map can never coexist)
Task 20: Ruling: deployed to https://kebabarium.oleg-kotsik.workers.dev with the owner's already-logged-in wrangler (D1 created in eeur); setting secrets (SESSION_SECRET, IP_HASH_SECRET, ADMIN_EMAILS) was blocked by the permission classifier, so the owner runs those three commands — until then sign-in/reviews answer 503 not_configured — cost if wrong: none
Task 20: complete (commits 88629bd..0b901de, tests: npm test →    Duration  6.48s (transform 10.77s, setup 25.07s, import 876ms, tests 1.91s, environment 2ms))

## Final review
Final: reviewer (opus, fresh context) — Critical 0, Important 4, Minor 11; suites green (shared 21, web 47, worker 90).
Final: Ruling: Minor 2 (Turnstile token not reset after an error) re-graded to Important — any failed submit makes every retry fail with a false bot-check error until reload, on the core anonymous-review flow — cost if wrong: none
Final: Ruling: Important 4 (same-place attack with cleared cookies + new IP) is not changed now — it follows spec §8b.3 literally and holding every same-/24 anonymous review would flood moderation on Ukrainian mobile carrier NAT; raised to the owner as a spec decision — cost if wrong: a determined person can add ~3 half-weight anonymous ratings/hour to one place until an admin hides them
Final: fixed refresh stalling on one broken place — review-fixes.test "moves past a place Google no longer knows" RED→GREEN, suite 162/162
Final: fixed sync runs not explaining no-op runs (notes column, migration 0002) — "stores notes such as a missing key" RED→GREEN, suite 162/162
Final: fixed banned users editing ratings — "refuses a banned user editing an existing rating" RED→GREEN, suite 162/162
Final: fixed Turnstile token reuse after a failed submit — review-modal.spec "resets the single-use Turnstile token" RED→GREEN, suite 162/162
Final: minor (deferred): hidden reviews do not count toward the per-place cooldown
Final: minor (deferred): live feed cursor can skip anonymous reviews published after the 10-min delay and late Google/Threads items for open sessions (they appear on reload)
Final: minor (deferred): emoji initials render as a broken surrogate (use [...s][0])
Final: minor (deferred): long Threads posts not truncated in the feed; no dir=auto for RTL
Final: minor (deferred): /me top list breaks for a rated place later hidden by admin; /me links hardcode /lviv
Final: minor (deferred): hidden places still counted in feed, stats and chain score on the place card
Final: minor (deferred): admin approve can resurrect an author-deleted rating (500 on unique index); page=1e999 → 500; move-loop check only one level deep
Final: minor (deferred): one unparseable Threads timestamp aborts the batch
Final: minor (deferred): anonymous nicknames can imitate registered nicknames
Final: minor (deferred): logout/admin removal not revoked server-side until cookie expiry/next login
