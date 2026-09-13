# Manix

A fast, ad-free manhwa reader. Monorepo with a Next.js web app (`apps/web`, Plan 2) and an
Express + MongoDB API (`apps/server`).

## Content source and terms

Chapters come from the [MangaDex API](https://api.mangadex.org/docs/). Manix follows its rules:

- No ads and no paid features anywhere on the site. Donations are allowed.
- MangaDex and scanlation groups are credited.
- Every MangaDex request and image goes through our server with an honest `User-Agent`.
  Browsers never contact MangaDex directly.
- Requests are rate-limited (4 req/s API, 36 req/min at-home) and image fetches from
  MangaDex@Home nodes are reported to `api.mangadex.network/report`.
- Scanlation group removal requests are honored:
  `npm run block-group -w @manix/server -- <groupId> <reason>`.

## Requirements

- Node.js 22+
- MongoDB 7+ (local, Docker, or MongoDB Atlas)

## Setup

```bash
npm install
cp apps/server/.env.example apps/server/.env   # then fill in the secrets and MONGODB_URI
npm run dev:server                              # http://localhost:4000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:server` | Start the API with reload |
| `npm test` | Run all workspace tests (downloads a MongoDB binary on first run) |
| `npm run typecheck` | Type-check all workspaces |
| `npm run build -w @manix/server` then `npm start -w @manix/server` | Production build and run |
| `npm run block-group -w @manix/server -- <groupId> <reason>` | Block a scanlation group (dev, via tsx) |
| `npm run block-group:prod -w @manix/server -- <groupId> <reason>` | Block a scanlation group (after `npm run build`) |

## Deployment notes

- Set `TRUST_PROXY` to the number of reverse-proxy hops in front of Express (default `1`) so
  client IPs used by rate limits are read correctly; the web app / load balancer in front of it
  must forward `X-Forwarded-For`. The Express port itself must not be publicly reachable — only
  the web app or reverse proxy in front of it should be exposed to the internet.
- Put a CDN in front of `/img/*`. Cover images are immutable for a year. Chapter page images are
  cacheable for a day at the edge but shared caches (`s-maxage`) should only hold them for up to
  an hour, so a `block-group` run is reflected promptly; if a scanlation group is blocked, purge
  `/img/ch/*` for its chapters from the CDN, or wait up to an hour for shared caches to expire it
  on their own.
- `IMAGE_CACHE_DIR` should be on persistent disk.
