# Manix — Manhwa Reader: Design Spec

- **Date:** 2026-09-13
- **Status:** Approved in brainstorming, pending written-spec review
- **Stack:** Next.js (App Router) · Express · MongoDB (Mongoose) · TypeScript · npm workspaces

## 1. Goal

A public, fast manhwa reading website. Many existing reader sites are slow; Manix
serves content through its own caching backend so browsing and reading feel instant.
Features grow incrementally; this spec covers the v1 foundation.

## 2. Content source and its terms

The v1 content source is the **MangaDex API** (https://api.mangadex.org/docs/).
Terms we must follow at all times:

| Rule | How Manix complies |
|---|---|
| No ads or paid services on the site/apps | Manix is ad-free with no premium tiers while MangaDex content is served. Donations (no perks) are allowed. |
| Credit MangaDex | Attribution in the site footer and on title pages. |
| Credit scanlation groups | Group names shown on chapter lists and in the reader. |
| Honor removal requests from scanlation group leaders | `blockedGroups` collection; chapters from blocked groups are filtered everywhere. Contact/DMCA page exists. |
| ~5 req/s per IP; `/at-home/server` 40 req/min; chapter reads 300/10min | Server-side queue at 4 req/s; separate at-home limiter at 36/min; metadata cached in MongoDB. |
| No CORS for external sites; no hotlinking; must proxy | Browser never calls MangaDex. All API calls and images go through Express. |
| Real (non-spoofed) User-Agent; no `Via` header | `APP_USER_AGENT` env, e.g. `Manix/0.1 (+contact url)`; proxy strips `Via`. |
| No auth headers to image servers | Image fetcher sends no Authorization/Cookie headers. |
| at-home baseUrl valid ~15 min | Page lists cached in memory ≤10 min; on 403, refresh baseUrl once and retry. |
| Report non-`mangadex.org` node fetches to `https://api.mangadex.network/report` | Fire-and-forget report on every upstream image fetch from such nodes (url, success, bytes, duration, cached). |
| `offset + limit ≤ 10000`, `limit ≤ 100` | Pagination capped in the client. |

**Known limitation:** many officially licensed Korean manhwa are not on MangaDex.
Future sources must be free/open with compatible terms.

**Monetization rule for the codebase:** ads or premium features are only permissible
if MangaDex content is removed or replaced by a licensed source. No monetization
module is built in v1.

## 3. Architecture (Approach A)

Express is the single backend; Next.js is a frontend only.

```
manix/                          npm workspaces monorepo
├─ apps/
│  ├─ web/                      Next.js App Router + Tailwind CSS
│  └─ server/                   Express + Mongoose
│     └─ src/
│        ├─ config/             env validation (zod)
│        ├─ modules/auth        register/login/refresh/logout/me
│        ├─ modules/sources/mangadex  API client, limiter, mappers
│        ├─ modules/catalog     manga + chapter caching & endpoints
│        ├─ modules/images      image proxy, disk cache, @Home report
│        ├─ modules/library     library, progress, history
│        └─ modules/moderation  blocked groups
└─ packages/shared              shared TypeScript DTO types
```

- The Next.js server renders pages by calling Express directly (`SERVER_API_URL`).
- The browser calls `/api/*` and `/img/*` on the Next.js origin; Next rewrites them to
  Express. Everything is same-origin, so no CORS and cookies work simply.
- The image module is isolated so it can be split into its own service later.

## 4. Data models

MangaDex data is cached, not owned. Cached documents carry `source` (`"mangadex"`,
later `"local"`) and `sourceId`.

- **users** — `email` (unique, lowercase), `username` (unique), `passwordHash`,
  `role` (`user` | `admin`), `prefs { readerMode: "strip" | "paged", dataSaver: boolean,
  contentRating: string[] }`, timestamps.
- **sessions** — `userId`, `refreshTokenHash`, `userAgent`, `expiresAt` (TTL index).
- **manga** — `source`, `sourceId`, `title`, `altTitles[]`, `description`,
  `originalLanguage`, `status`, `year`, `tags[{id,name,group}]`, `contentRating`,
  `coverFile`, `authors[]`, `artists[]`, `lastChapterAt`, `cachedAt`.
  Unique (`source`,`sourceId`); text index on `title`,`altTitles`. Stale after 6h.
- **chapters** — `source`, `sourceId`, `mangaSourceId`, `number`, `volume`, `title`,
  `language`, `pages`, `groups[{id,name}]`, `externalUrl`, `publishedAt`, `cachedAt`.
  Index (`mangaSourceId`,`language`,`number`). Stale after 1h.
- **library** — `userId`, `mangaSourceId`, `status` (`reading` | `plan` | `completed` |
  `dropped`), timestamps. Unique (`userId`,`mangaSourceId`).
- **progress** — `userId`, `mangaSourceId`, `chapterSourceId`, `chapterNumber`, `page`,
  `totalPages`, `updatedAt`. Unique (`userId`,`mangaSourceId`).
- **history** — `userId`, `mangaSourceId`, `chapterSourceId`, `readAt`. Trimmed to the
  latest 500 per user.
- **blockedGroups** — `groupSourceId` (unique), `name`, `reason`, `requestedAt`.

Chapter page lists (at-home data) are never persisted; they live in an in-memory
TTL cache (10 min).

## 5. API surface (v1)

Auth
- `POST /api/auth/register` `{email, username, password}`
- `POST /api/auth/login` `{email, password}`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET  /api/auth/me`

Catalog
- `GET /api/manga?q=&tags=&status=&originalLanguage=ko&order=&page=` — search/browse
- `GET /api/manga/:id` — details (cached)
- `GET /api/manga/:id/chapters?lang=en` — chapter list with groups, blocked groups removed
- `GET /api/chapters/:id` — chapter metadata + prev/next chapter ids
- `GET /api/chapters/:id/pages?quality=data|data-saver` — returns Manix image URLs

Images
- `GET /img/ch/:chapterId/:quality/:filename`
- `GET /img/cover/:mangaId/:filename`

Library (auth required)
- `GET/PUT/DELETE /api/library/:mangaId`, `GET /api/library`
- `PUT /api/progress` `{mangaId, chapterId, chapterNumber, page, totalPages}`
- `GET /api/progress/continue` — recent in-progress titles
- `GET /api/history`

Errors use `{ "error": { "code": string, "message": string } }`.

## 6. Key flows

### Reading a chapter
1. `/read/[chapterId]` is server-rendered with chapter metadata and credits.
2. Client requests `/api/chapters/:id/pages`. Server calls `/at-home/server/:id`
   (at-home limiter), caches the result 10 min, and returns
   `/img/ch/:chapterId/:quality/:filename` URLs.
3. `/img/ch/...`: disk cache hit → stream with
   `Cache-Control: public, max-age=31536000, immutable`. Miss → fetch from node
   (real UA, no auth, no Via), stream to client while writing a temp file then renaming
   into the cache; report to @Home network if host is not `mangadex.org`. Upstream
   403/timeout → refresh baseUrl once and retry.
4. Reader preloads the next 4 images; near the end, prefetches the next chapter.
   Progress saved with a 2s debounce.

### MangaDex client resilience
- Single FIFO queue at 4 req/s; at-home queue 36/min.
- 429 → exponential backoff honoring `Retry-After` / `X-RateLimit-Retry-After`.
- Repeated 403 → circuit breaker opens for 60s; catalog serves stale MongoDB data and
  the UI shows a "source temporarily unavailable" banner.

### Auth
- bcrypt (cost 12). Access JWT 15 min; refresh token 30 days (random, stored hashed,
  rotated on refresh). Both in httpOnly, `SameSite=Lax`, `Secure` in production cookies.
- Login/register rate-limited (10/15 min per IP). Input validated with zod. helmet on.

## 7. Frontend (v1 pages)

- `/` — continue reading (if logged in), recently updated, popular manhwa
- `/search` — query + filters (tags, status, origin language; defaults to Korean)
- `/title/[id]` — cover, description, tags, add-to-library, chapter list with groups
- `/read/[chapterId]` — reader: long-strip (default) or paged mode, data-saver toggle,
  prev/next chapter, keyboard shortcuts (←/→, J/K), progress bar, group credits
- `/library` — tabs by status
- `/history`
- `/login`, `/register`
- `/about` — MangaDex attribution, removal/DMCA contact
- Global footer with MangaDex credit

## 8. Configuration

Server `.env` (validated at boot):
`PORT`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `APP_USER_AGENT`,
`IMAGE_CACHE_DIR`, `IMAGE_CACHE_MAX_GB`, `NODE_ENV`, `CLIENT_ORIGIN`.

Web `.env`: `SERVER_API_URL` (e.g. `http://localhost:4000`).

Image cache evicts least-recently-used files when it exceeds `IMAGE_CACHE_MAX_GB`.
Production: MongoDB Atlas cluster; CDN (e.g. Cloudflare) may sit in front of `/img/*`.

## 9. Testing

- **server:** Vitest + Supertest + `mongodb-memory-server`. MangaDex client tested with
  recorded JSON fixtures and a mocked `fetch`; tests never call the real API.
- **web:** Vitest + Testing Library for components; one Playwright smoke test
  (register → search → open title → read → resume) against mocked server data.

## 10. Out of scope for v1 (planned later)

Comments, ratings, follows, recommendations, donations page, admin/creator uploads
(`source: "local"`), OAuth login, email verification/password reset, notifications,
additional sources.
