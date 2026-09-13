# Manix

A fast, ad-free manhwa reader. Monorepo with a Next.js web app (`apps/web`) and an
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
cp apps/web/.env.example apps/web/.env.local   # SERVER_API_URL defaults to http://localhost:4000
npm run dev                                     # API on :4000 and web on :3000
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the API and the web app together |
| `npm run dev:server` | Start the API with reload |
| `npm run dev:web` | Start only the web app on http://localhost:3000 |
| `npm test` | Run all workspace tests (downloads a MongoDB binary on first run) |
| `npm run typecheck` | Type-check all workspaces |
| `npm run build -w @manix/server` then `npm start -w @manix/server` | Production build and run of the API |
| `npm run build -w @manix/web` then `npm start -w @manix/web` | Production build and run of the web app |
| `npm run block-group -w @manix/server -- <groupId> <reason>` | Block a scanlation group (dev, via tsx) |
| `npm run block-group:prod -w @manix/server -- <groupId> <reason>` | Block a scanlation group (after `npm run build`) |

## Deployment notes

- The web app needs `SERVER_API_URL` pointing at the API. Browsers reach the API only through
  the web app's `/api` and `/img` rewrites.
- Set the API's `TRUST_PROXY` to the number of proxies in front of it so client IPs used by rate
  limits are read correctly: `1` when only the web app proxies it, `2` when a CDN or load
  balancer sits in front of the web app. Whichever proxy is directly in front of Express must
  forward `X-Forwarded-For`. The Express port itself must not be publicly reachable — only the
  web app or reverse proxy in front of it should be exposed to the internet.
- Put a CDN in front of `/img/*`. Cover images are immutable for a year. Chapter page images are
  cacheable for a day at the edge but shared caches (`s-maxage`) should only hold them for up to
  an hour, so a `block-group` run is reflected promptly; if a scanlation group is blocked, purge
  `/img/ch/*` for its chapters from the CDN, or wait up to an hour for shared caches to expire it
  on their own.
- `IMAGE_CACHE_DIR` should be on persistent disk.
