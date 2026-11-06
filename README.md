# Кебабаріум

Fan site for rating shawarma/kebab spots: a dark 3D map of Lviv where the best spots stand tallest and greenest, a live review feed, leaderboards and anonymous-but-protected reviews.

- `apps/worker` — Cloudflare Worker (Hono API, D1, hourly cron sync with Google Places + Threads), also serves the web app.
- `apps/web` — Angular app.
- `packages/shared` — types, scoring and the rating colour/height scale shared by both.
- `docs/` — design spec, plan, mockup, deploy runbook.

## Develop

```bash
npm install
npm test                                   # all workspaces
npm -w apps/worker run db:migrate:local    # local D1 schema
npm -w apps/worker run db:seed:local       # dev-only sample places
npm run dev                                # wrangler dev (API + built web)
```

## Deploy

See `docs/DEPLOY.md`.
