# Manix Server (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Manix monorepo foundation and the Express + MongoDB backend: auth, a terms-compliant MangaDex proxy with MongoDB caching, a disk-cached image proxy, and library/progress/history APIs.

**Architecture:** npm-workspaces monorepo. `apps/server` is an Express 5 app built by a `createApp(deps)` factory so tests can inject a fake MangaDex client and fake `fetch`. Feature code lives in `src/modules/<feature>`; each module owns its models, service, and routes. `packages/shared` holds DTO types consumed by the server now and the Next.js web app in Plan 2.

**Tech Stack:** Node 22, TypeScript, Express 5, Mongoose 8, zod 3, jsonwebtoken, bcryptjs, helmet, express-rate-limit, cookie-parser, tsx (dev), tsup (build), Vitest, Supertest, mongodb-memory-server.

**Spec:** `docs/superpowers/specs/2026-09-13-manix-manhwa-reader-design.md`

## Global Constraints

- Node `>=22`. All packages are ESM (`"type": "module"`), TypeScript `strict: true`, `moduleResolution: "Bundler"` (relative imports have no file extension).
- The browser never talks to MangaDex. All MangaDex API calls and images go through the server.
- Every request to MangaDex sends `User-Agent: <APP_USER_AGENT>`. Never send a `Via` header. Never send `Authorization` or cookies to image servers.
- MangaDex API: at most 4 req/s from the main queue; `/at-home/server` at most 36 req/min; `offset + limit <= 10000`; `limit <= 100` (feed endpoints `<= 500`).
- at-home page lists are cached in memory for at most 10 minutes and are never persisted.
- Image fetches from nodes whose host does not end in `mangadex.org` are reported to `MANGADEX_REPORT_URL` (`https://api.mangadex.network/report`).
- Chapters from `blockedGroups` are never listed or served.
- No ads, no paid features, no monetization code.
- Error body shape: `{ "error": { "code": string, "message": string } }`.
- Cache TTLs: manga 6h, chapter feed 1h, at-home 10 min.
- Tests never call the real MangaDex API.
- Spec deviations (intentional): `CLIENT_ORIGIN` is dropped (same-origin via Next rewrites makes it unused); manga `lastChapterAt` is named `sourceUpdatedAt` (MangaDex `updatedAt`); the "source unavailable" banner reads `sourceAvailable` from `GET /api/health`; blocked groups are managed with a CLI script (no admin UI in v1).

## File Structure

```
package.json                         workspaces + root scripts
tsconfig.base.json                   shared compiler options
packages/shared/
  package.json
  src/index.ts                       DTO types shared by server and web
apps/server/
  package.json  tsconfig.json  vitest.config.ts  tsup.config.ts  .env.example
  src/
    index.ts                         process entry: env, db, listen
    app.ts                           createApp(deps): middleware + routers
    config/env.ts                    zod-validated environment
    db/connect.ts                    mongoose connection
    lib/errors.ts                    HttpError, notFound, errorHandler
    lib/rate-limiter.ts              FIFO spacing rate limiter
    modules/auth/
      user.model.ts  session.model.ts  tokens.ts
      auth.service.ts  auth.middleware.ts  auth.routes.ts
    modules/sources/mangadex/
      types.ts                       raw MangaDex response types
      client.ts                      HTTP client: UA, limiter, retry, breaker
      mappers.ts                     raw -> MangaRecord / ChapterRecord
    modules/moderation/blocked-group.model.ts
    modules/catalog/
      manga.model.ts  chapter.model.ts  dto.ts  catalog.schemas.ts
      catalog.service.ts  chapter-pages.service.ts  catalog.routes.ts
    modules/images/
      disk-cache.ts  image.service.ts  images.routes.ts
    modules/library/
      library.model.ts  progress.model.ts  history.model.ts
      library.service.ts  library.routes.ts
    scripts/block-group.ts           CLI to honor group removal requests
  test/
    helpers/env.ts  helpers/db.ts  helpers/app.ts
    helpers/fake-mangadex.ts  helpers/fixtures.ts
    fixtures/manga.json  fixtures/chapters.json  fixtures/at-home.json
    app.test.ts  auth.test.ts  rate-limiter.test.ts  mangadex-client.test.ts
    mappers.test.ts  catalog.test.ts  chapter-pages.test.ts
    disk-cache.test.ts  images.test.ts  library.test.ts
```

---

### Task 1: Monorepo scaffold, shared types, server skeleton

**Files:**
- Create: `package.json`, `tsconfig.base.json`
- Create: `packages/shared/package.json`, `packages/shared/src/index.ts`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`, `apps/server/tsup.config.ts`
- Create: `apps/server/src/config/env.ts`, `apps/server/src/lib/errors.ts`, `apps/server/src/db/connect.ts`, `apps/server/src/app.ts`
- Create: `apps/server/test/helpers/env.ts`, `apps/server/test/helpers/db.ts`, `apps/server/test/helpers/app.ts`
- Test: `apps/server/test/app.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?): Env`; `type Env`; `class HttpError(status, code, message)`; `notFound`, `errorHandler`; `connectDb(uri)`; `createApp(deps: AppDeps)`; `interface AppDeps { env: Env }`; test helpers `testEnv(overrides?)`, `startTestDb()`, `clearTestDb()`, `stopTestDb()`, `buildTestApp(deps?)`; all DTO types in `@manix/shared`.

- [ ] **Step 1: Create root workspace files**

`package.json`:
```json
{
  "name": "manix",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "dev:server": "npm run dev -w @manix/server",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present"
  },
  "engines": { "node": ">=22" }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  }
}
```

- [ ] **Step 2: Create the shared types package**

`packages/shared/package.json`:
```json
{
  "name": "@manix/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

`packages/shared/src/index.ts`:
```ts
export type ContentSource = "mangadex" | "local";
export type ReadingStatus = "reading" | "plan" | "completed" | "dropped";
export type ImageQuality = "data" | "data-saver";

export interface TagDTO {
  id: string;
  name: string;
  group: string;
}

export interface MangaDTO {
  id: string;
  source: ContentSource;
  title: string;
  altTitles: string[];
  description: string;
  originalLanguage: string;
  status: string;
  year: number | null;
  tags: TagDTO[];
  contentRating: string;
  coverUrl: string | null;
  authors: string[];
  artists: string[];
  sourceUpdatedAt: string | null;
}

export interface GroupDTO {
  id: string;
  name: string;
}

export interface ChapterDTO {
  id: string;
  mangaId: string;
  number: string | null;
  volume: string | null;
  title: string | null;
  language: string;
  pages: number;
  groups: GroupDTO[];
  externalUrl: string | null;
  publishedAt: string;
}

export interface ChapterDetailDTO extends ChapterDTO {
  prevChapterId: string | null;
  nextChapterId: string | null;
}

export interface ChapterPagesDTO {
  chapterId: string;
  quality: ImageQuality;
  pages: string[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserPrefs {
  readerMode: "strip" | "paged";
  dataSaver: boolean;
  contentRating: string[];
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  prefs: UserPrefs;
}

export interface LibraryEntryDTO {
  mangaId: string;
  status: ReadingStatus;
  updatedAt: string;
  manga: MangaDTO | null;
}

export interface ProgressDTO {
  mangaId: string;
  chapterId: string;
  chapterNumber: string | null;
  page: number;
  totalPages: number;
  updatedAt: string;
  manga: MangaDTO | null;
}

export interface HistoryEntryDTO {
  mangaId: string;
  chapterId: string;
  readAt: string;
  manga: MangaDTO | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
```

- [ ] **Step 3: Create the server package and install dependencies**

`apps/server/package.json`:
```json
{
  "name": "@manix/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "block-group": "tsx src/scripts/block-group.ts"
  },
  "dependencies": {
    "@manix/shared": "*"
  }
}
```

Run from the repo root:
```bash
npm install -w @manix/server express@^5 mongoose@^8 zod@^3 jsonwebtoken@^9 bcryptjs@^3 cookie-parser@^1 helmet@^8 express-rate-limit@^7
npm install -D -w @manix/server typescript@^5 tsx@^4 tsup@^8 vitest@^3 supertest@^7 mongodb-memory-server@^10 @types/node@^22 @types/express@^5 @types/jsonwebtoken@^9 @types/cookie-parser@^1 @types/supertest@^6
```
Expected: installs complete, `node_modules/@manix/shared` is a symlink to `packages/shared`.

`apps/server/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["src", "test", "vitest.config.ts", "tsup.config.ts"]
}
```

`apps/server/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
```

`apps/server/tsup.config.ts`:
```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  clean: true,
  noExternal: ["@manix/shared"],
});
```

- [ ] **Step 4: Write test helpers**

`apps/server/test/helpers/env.ts`:
```ts
import os from "node:os";
import path from "node:path";
import { loadEnv, type Env } from "../../src/config/env";

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    NODE_ENV: "test",
    MONGODB_URI: "mongodb://unused-in-tests",
    JWT_ACCESS_SECRET: "test-access-secret-0123456789abcdef",
    JWT_REFRESH_SECRET: "test-refresh-secret-0123456789abcdef",
    APP_USER_AGENT: "Manix-Test/0.0",
    BCRYPT_COST: "4",
    IMAGE_CACHE_DIR: path.join(os.tmpdir(), "manix-test-images"),
    MANGADEX_API_URL: "https://api.mangadex.test",
    MANGADEX_UPLOADS_URL: "https://uploads.mangadex.test",
    MANGADEX_REPORT_URL: "https://report.mangadex.test/report",
    ...overrides,
  });
}
```

`apps/server/test/helpers/db.ts`:
```ts
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

let server: MongoMemoryServer | undefined;

export async function startTestDb(): Promise<void> {
  server = await MongoMemoryServer.create();
  await mongoose.connect(server.getUri());
}

export async function clearTestDb(): Promise<void> {
  const collections = await mongoose.connection.db!.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

export async function stopTestDb(): Promise<void> {
  await mongoose.disconnect();
  await server?.stop();
}
```

`apps/server/test/helpers/app.ts`:
```ts
import { createApp, type AppDeps } from "../../src/app";
import { testEnv } from "./env";

export function buildTestApp(deps: Partial<AppDeps> = {}) {
  return createApp({ env: testEnv(), ...deps });
}
```

- [ ] **Step 5: Write the failing test**

`apps/server/test/app.test.ts`:
```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/config/env";
import { buildTestApp } from "./helpers/app";

describe("app skeleton", () => {
  it("responds to health checks", async () => {
    const res = await request(buildTestApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const res = await request(buildTestApp()).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "not_found", message: "Route not found" } });
  });

  it("rejects an invalid environment", () => {
    expect(() => loadEnv({ NODE_ENV: "test" })).toThrow(/Invalid environment/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -w @manix/server`
Expected: FAIL, cannot resolve `../src/config/env` / `../../src/app`.

- [ ] **Step 7: Implement env, errors, db, app**

`apps/server/src/config/env.ts`:
```ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  APP_USER_AGENT: z.string().min(3),
  IMAGE_CACHE_DIR: z.string().min(1).default(".cache/images"),
  IMAGE_CACHE_MAX_GB: z.coerce.number().positive().default(10),
  MANGADEX_API_URL: z.string().url().default("https://api.mangadex.org"),
  MANGADEX_UPLOADS_URL: z.string().url().default("https://uploads.mangadex.org"),
  MANGADEX_REPORT_URL: z.string().url().default("https://api.mangadex.network/report"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}
```

`apps/server/src/lib/errors.ts`:
```ts
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, "not_found", "Route not found"));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof ZodError) {
    const message = err.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    res.status(400).json({ error: { code: "validation_error", message } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
};
```

`apps/server/src/db/connect.ts`:
```ts
import mongoose from "mongoose";

export async function connectDb(uri: string): Promise<typeof mongoose.connection> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}
```

`apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";

export interface AppDeps {
  env: Env;
}

export function createApp({ env }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: 3 tests PASS; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json packages apps/server
git commit -m "feat(server): scaffold monorepo, shared types, and Express skeleton"
```

---

### Task 2: Authentication

**Files:**
- Create: `apps/server/src/modules/auth/user.model.ts`, `session.model.ts`, `tokens.ts`, `auth.service.ts`, `auth.middleware.ts`, `auth.routes.ts`
- Modify: `apps/server/src/app.ts` (full replacement below)
- Modify: `apps/server/test/helpers/app.ts` (full replacement below)
- Test: `apps/server/test/auth.test.ts`

**Interfaces:**
- Consumes: `Env`, `HttpError`, `UserDTO`.
- Produces: `User` model, `toUserDTO(user)`; `authenticate(env): RequestHandler` (sets `req.auth`); `requireAuth: RequestHandler`; `currentUserId(req): string`; `authRouter(env): Router`; cookies `mx_at` (access, path `/`) and `mx_rt` (refresh, path `/api/auth`); test helper `registerAgent(app): Promise<TestAgent>`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/auth.test.ts`:
```ts
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { User } from "../src/modules/auth/user.model";
import { buildTestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";

function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith(`${name}=`));
  return cookie?.split(";")[0].slice(name.length + 1);
}

const credentials = { email: "Reader@Example.com", username: "reader_1", password: "password123" };

describe("auth", () => {
  const app = buildTestApp();

  beforeAll(async () => {
    await startTestDb();
    await User.init();
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("registers a user, sets cookies, and returns the profile from /me", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send(credentials);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "reader@example.com", username: "reader_1", role: "user" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieValue(res, "mx_at")).toBeTruthy();
    expect(cookieValue(res, "mx_rt")).toBeTruthy();

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("reader_1");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send(credentials);
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...credentials, username: "someone_else" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_taken");
  });

  it("validates registration input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", username: "x", password: "short" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_error");
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await request(app).post("/api/auth/register").send(credentials);
    const bad = await request(app).post("/api/auth/login").send({ email: credentials.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe("invalid_credentials");

    const good = await request(app).post("/api/auth/login").send({ email: credentials.email, password: credentials.password });
    expect(good.status).toBe(200);
    expect(good.body.user.username).toBe("reader_1");
  });

  it("rotates the refresh token and rejects reuse of the old one", async () => {
    const agent = request.agent(app);
    const reg = await agent.post("/api/auth/register").send(credentials);
    const oldRefresh = cookieValue(reg, "mx_rt");

    const refreshed = await agent.post("/api/auth/refresh");
    expect(refreshed.status).toBe(200);
    expect(cookieValue(refreshed, "mx_rt")).not.toBe(oldRefresh);

    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", `mx_rt=${oldRefresh}`);
    expect(reuse.status).toBe(401);
  });

  it("logs out and invalidates the session", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send(credentials);
    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);
    expect((await agent.get("/api/auth/me")).status).toBe(401);
    expect((await agent.post("/api/auth/refresh")).status).toBe(401);
  });

  it("requires auth for /me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @manix/server -- auth`
Expected: FAIL, cannot resolve `../src/modules/auth/user.model`.

- [ ] **Step 3: Implement models and tokens**

`apps/server/src/modules/auth/user.model.ts`:
```ts
import type { UserDTO, UserPrefs } from "@manix/shared";
import { Schema, model, type HydratedDocument } from "mongoose";

export interface UserAttrs {
  email: string;
  username: string;
  passwordHash: string;
  role: "user" | "admin";
  prefs: UserPrefs;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<UserAttrs>;

const userSchema = new Schema<UserAttrs>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    prefs: {
      readerMode: { type: String, enum: ["strip", "paged"], default: "strip" },
      dataSaver: { type: Boolean, default: false },
      contentRating: { type: [String], default: ["safe", "suggestive"] },
    },
  },
  { timestamps: true },
);

export const User = model<UserAttrs>("User", userSchema);

export function toUserDTO(user: UserDoc): UserDTO {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    role: user.role,
    prefs: {
      readerMode: user.prefs.readerMode,
      dataSaver: user.prefs.dataSaver,
      contentRating: [...user.prefs.contentRating],
    },
  };
}
```

`apps/server/src/modules/auth/session.model.ts`:
```ts
import { Schema, model, type Types } from "mongoose";

export interface SessionAttrs {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  userAgent: string;
  expiresAt: Date;
}

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refreshTokenHash: { type: String, required: true, unique: true },
    userAgent: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<SessionAttrs>("Session", sessionSchema);
```

`apps/server/src/modules/auth/tokens.ts`:
```ts
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AccessPayload {
  sub: string;
  role: "user" | "admin";
}

export function signAccessToken(payload: AccessPayload, secret: string): string {
  return jwt.sign(payload, secret, { expiresIn: ACCESS_TTL_SECONDS });
}

export function verifyAccessToken(token: string, secret: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === "string" || typeof decoded.sub !== "string") return null;
    return { sub: decoded.sub, role: decoded.role === "admin" ? "admin" : "user" };
  } catch {
    return null;
  }
}

export function newRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(token).digest("hex");
}
```

- [ ] **Step 4: Implement service, middleware, routes**

`apps/server/src/modules/auth/auth.service.ts`:
```ts
import bcrypt from "bcryptjs";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { Session } from "./session.model";
import { hashRefreshToken, newRefreshToken, REFRESH_TTL_SECONDS, signAccessToken } from "./tokens";
import { User, type UserDoc } from "./user.model";

export interface AuthResult {
  user: UserDoc;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(private readonly env: Env) {}

  async register(input: { email: string; username: string; password: string }, userAgent: string): Promise<AuthResult> {
    const email = input.email.toLowerCase();
    const existing = await User.findOne({ $or: [{ email }, { username: input.username }] });
    if (existing) {
      if (existing.email === email) throw new HttpError(409, "email_taken", "Email is already registered");
      throw new HttpError(409, "username_taken", "Username is taken");
    }
    const passwordHash = await bcrypt.hash(input.password, this.env.BCRYPT_COST);
    const user = await User.create({ email, username: input.username, passwordHash });
    return this.issue(user, userAgent);
  }

  async login(input: { email: string; password: string }, userAgent: string): Promise<AuthResult> {
    const user = await User.findOne({ email: input.email.toLowerCase() });
    const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !valid) throw new HttpError(401, "invalid_credentials", "Invalid email or password");
    return this.issue(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent: string): Promise<AuthResult> {
    const session = await Session.findOneAndDelete({
      refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET),
      expiresAt: { $gt: new Date() },
    });
    if (!session) throw new HttpError(401, "invalid_refresh", "Session expired, please log in again");
    const user = await User.findById(session.userId);
    if (!user) throw new HttpError(401, "invalid_refresh", "Session expired, please log in again");
    return this.issue(user, userAgent);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await Session.deleteOne({ refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET) });
  }

  private async issue(user: UserDoc, userAgent: string): Promise<AuthResult> {
    const refreshToken = newRefreshToken();
    await Session.create({
      userId: user._id,
      refreshTokenHash: hashRefreshToken(refreshToken, this.env.JWT_REFRESH_SECRET),
      userAgent: userAgent.slice(0, 300),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    const accessToken = signAccessToken({ sub: String(user._id), role: user.role }, this.env.JWT_ACCESS_SECRET);
    return { user, accessToken, refreshToken };
  }
}
```

`apps/server/src/modules/auth/auth.middleware.ts`:
```ts
import type { Request, RequestHandler } from "express";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { verifyAccessToken, type AccessPayload } from "./tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessPayload;
    }
  }
}

export const ACCESS_COOKIE = "mx_at";
export const REFRESH_COOKIE = "mx_rt";

export function authenticate(env: Env): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[ACCESS_COOKIE];
    if (typeof token === "string") {
      const payload = verifyAccessToken(token, env.JWT_ACCESS_SECRET);
      if (payload) req.auth = payload;
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new HttpError(401, "unauthorized", "Login required"));
    return;
  }
  next();
};

export function currentUserId(req: Request): string {
  if (!req.auth) throw new HttpError(401, "unauthorized", "Login required");
  return req.auth.sub;
}
```

`apps/server/src/modules/auth/auth.routes.ts`:
```ts
import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { ACCESS_COOKIE, currentUserId, REFRESH_COOKIE, requireAuth } from "./auth.middleware";
import { AuthService, type AuthResult } from "./auth.service";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from "./tokens";
import { toUserDTO, User } from "./user.model";

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/, "must be 3-24 letters, numbers, or underscores"),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export function authRouter(env: Env): Router {
  const service = new AuthService(env);
  const router = Router();
  const secure = env.NODE_ENV === "production";

  const credentialLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many attempts, try again later")),
  });

  function setAuthCookies(res: Response, result: AuthResult): void {
    res.cookie(ACCESS_COOKIE, result.accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: ACCESS_TTL_SECONDS * 1000,
    });
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/api/auth",
      maxAge: REFRESH_TTL_SECONDS * 1000,
    });
  }

  function clearAuthCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: "/" });
    res.clearCookie(REFRESH_COOKIE, { path: "/api/auth" });
  }

  router.post("/register", credentialLimiter, async (req, res) => {
    const body = registerSchema.parse(req.body);
    const result = await service.register(body, req.get("user-agent") ?? "");
    setAuthCookies(res, result);
    res.status(201).json({ user: toUserDTO(result.user) });
  });

  router.post("/login", credentialLimiter, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const result = await service.login(body, req.get("user-agent") ?? "");
    setAuthCookies(res, result);
    res.json({ user: toUserDTO(result.user) });
  });

  router.post("/refresh", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string") throw new HttpError(401, "invalid_refresh", "No active session");
    try {
      const result = await service.refresh(token, req.get("user-agent") ?? "");
      setAuthCookies(res, result);
      res.json({ user: toUserDTO(result.user) });
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  });

  router.post("/logout", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    await service.logout(typeof token === "string" ? token : undefined);
    clearAuthCookies(res);
    res.status(204).end();
  });

  router.get("/me", requireAuth, async (req, res) => {
    const user = await User.findById(currentUserId(req));
    if (!user) throw new HttpError(401, "unauthorized", "Login required");
    res.json({ user: toUserDTO(user) });
  });

  return router;
}
```

- [ ] **Step 5: Wire auth into the app and add a test helper**

Replace `apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";
import { authenticate } from "./modules/auth/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";

export interface AppDeps {
  env: Env;
}

export function createApp({ env }: AppDeps) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, env: env.NODE_ENV });
  });
  app.use("/api/auth", authRouter(env));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

Replace `apps/server/test/helpers/app.ts`:
```ts
import request from "supertest";
import { createApp, type AppDeps } from "../../src/app";
import { testEnv } from "./env";

export type TestApp = ReturnType<typeof createApp>;

export function buildTestApp(deps: Partial<AppDeps> = {}): TestApp {
  return createApp({ env: testEnv(), ...deps });
}

let userCounter = 0;

export async function registerAgent(app: TestApp) {
  userCounter += 1;
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    email: `user${userCounter}@example.com`,
    username: `user_${userCounter}`,
    password: "password123",
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: all tests in `app.test.ts` and `auth.test.ts` PASS (the first run downloads a MongoDB binary, which can take a minute); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): add email/password auth with rotating refresh sessions"
```

---
### Task 3: Rate limiter and MangaDex HTTP client

**Files:**
- Create: `apps/server/src/lib/rate-limiter.ts`
- Create: `apps/server/src/modules/sources/mangadex/client.ts`
- Test: `apps/server/test/rate-limiter.test.ts`, `apps/server/test/mangadex-client.test.ts`

**Interfaces:**
- Produces:
  - `class RateLimiter(intervalMs, now?, sleep?)` with `schedule<T>(task: () => Promise<T>): Promise<T>`, `static perSecond(n)`, `static perMinute(n)`.
  - `type Query = Record<string, string | number | boolean | string[] | undefined>`; `buildQuery(q: Query): string` (array keys get `[]` appended unless already present; empty arrays and `undefined` are skipped).
  - `class MangaDexError(status, message)`.
  - `interface MangaDexApi { get<T>(path: string, query?: Query): Promise<T>; getAtHome<T>(chapterId: string): Promise<T>; isAvailable(): boolean }`.
  - `class MangaDexClient implements MangaDexApi`, options `{ baseUrl; userAgent; fetchImpl?; limiter?; atHomeLimiter?; maxRetries?; breakerMs?; sleep?; now? }`.

- [ ] **Step 1: Write the failing rate limiter test**

`apps/server/test/rate-limiter.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../src/lib/rate-limiter";

describe("RateLimiter", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces task starts by the interval in FIFO order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new RateLimiter(250);
    const starts: number[] = [];
    const run = (i: number) =>
      limiter.schedule(async () => {
        starts.push(Date.now());
        return i;
      });

    const all = Promise.all([run(0), run(1), run(2)]);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(all).resolves.toEqual([0, 1, 2]);
    expect(starts).toEqual([0, 250, 500]);
  });

  it("does not delay a task when the limiter has been idle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new RateLimiter(250);
    await limiter.schedule(async () => undefined);
    vi.setSystemTime(10_000);
    const startedAt = await limiter.schedule(async () => Date.now());
    expect(startedAt).toBe(10_000);
  });

  it("builds per-second and per-minute limiters", () => {
    expect(RateLimiter.perSecond(4)).toBeInstanceOf(RateLimiter);
    expect(RateLimiter.perMinute(36)).toBeInstanceOf(RateLimiter);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @manix/server -- rate-limiter`
Expected: FAIL, cannot resolve `../src/lib/rate-limiter`.

- [ ] **Step 3: Implement the rate limiter**

`apps/server/src/lib/rate-limiter.ts`:
```ts
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Guarantees at least `intervalMs` between task starts. Slots are reserved
 * synchronously, so tasks start in the order they were scheduled.
 */
export class RateLimiter {
  private nextSlot = 0;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  static perSecond(count: number): RateLimiter {
    return new RateLimiter(1000 / count);
  }

  static perMinute(count: number): RateLimiter {
    return new RateLimiter(60_000 / count);
  }

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    const now = this.now();
    const slot = Math.max(now, this.nextSlot);
    this.nextSlot = slot + this.intervalMs;
    const wait = slot - now;
    if (wait > 0) await this.sleep(wait);
    return task();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @manix/server -- rate-limiter`
Expected: 3 tests PASS.

- [ ] **Step 5: Write the failing client test**

`apps/server/test/mangadex-client.test.ts`:
```ts
import { describe, expect, it, vi } from "vitest";
import { RateLimiter } from "../src/lib/rate-limiter";
import { buildQuery, MangaDexClient, MangaDexError } from "../src/modules/sources/mangadex/client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeClient(fetchImpl: typeof fetch, now = () => 0) {
  return new MangaDexClient({
    baseUrl: "https://api.mangadex.test",
    userAgent: "Manix-Test/0.0",
    fetchImpl,
    limiter: new RateLimiter(0),
    atHomeLimiter: new RateLimiter(0),
    sleep: vi.fn(async () => undefined),
    maxRetries: 2,
    breakerMs: 60_000,
    now,
  });
}

describe("buildQuery", () => {
  it("encodes scalars and appends [] to array keys", () => {
    const qs = buildQuery({
      title: "solo",
      limit: 20,
      includes: ["cover_art", "author"],
      "order[followedCount]": "desc",
      skipped: undefined,
    });
    const params = new URLSearchParams(qs.slice(1));
    expect(params.get("title")).toBe("solo");
    expect(params.get("limit")).toBe("20");
    expect(params.getAll("includes[]")).toEqual(["cover_art", "author"]);
    expect(params.get("order[followedCount]")).toBe("desc");
    expect(params.has("skipped")).toBe(false);
  });

  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({ tags: [] })).toBe("");
  });
});

describe("MangaDexClient", () => {
  it("sends the app User-Agent and no Via or Authorization header", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "ok" }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await client.get("/manga", { title: "solo" });

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.mangadex.test/manga?title=solo");
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Manix-Test/0.0");
    expect(headers.Via).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("retries after a 429 and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: "error" }, 429))
      .mockResolvedValueOnce(jsonResponse({ result: "ok", data: 1 }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.get("/manga")).resolves.toEqual({ result: "ok", data: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws MangaDexError on 404 without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "error" }, 404));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.get("/manga/missing")).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("wraps repeated network failures as a 502 MangaDexError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    const err = await client.get("/manga").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MangaDexError);
    expect((err as MangaDexError).status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("opens the circuit breaker after three 403s and closes it after breakerMs", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "error" }, 403));
    const client = makeClient(fetchImpl as unknown as typeof fetch, () => now);

    for (let i = 0; i < 3; i++) await client.get("/manga").catch(() => undefined);
    expect(client.isAvailable()).toBe(false);

    await expect(client.get("/manga")).rejects.toMatchObject({ status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    now = 60_001;
    expect(client.isAvailable()).toBe(true);
  });

  it("calls the at-home endpoint for a chapter", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: "ok", baseUrl: "https://node" }));
    const client = makeClient(fetchImpl as unknown as typeof fetch);

    await client.getAtHome("abc");

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.mangadex.test/at-home/server/abc");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -w @manix/server -- mangadex-client`
Expected: FAIL, cannot resolve `../src/modules/sources/mangadex/client`.

- [ ] **Step 7: Implement the client**

`apps/server/src/modules/sources/mangadex/client.ts`:
```ts
import { RateLimiter } from "../../../lib/rate-limiter";

export type Query = Record<string, string | number | boolean | string[] | undefined>;

export class MangaDexError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface MangaDexApi {
  get<T>(path: string, query?: Query): Promise<T>;
  getAtHome<T>(chapterId: string): Promise<T>;
  isAvailable(): boolean;
}

export interface MangaDexClientOptions {
  baseUrl: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
  limiter?: RateLimiter;
  atHomeLimiter?: RateLimiter;
  maxRetries?: number;
  breakerMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;
const BREAKER_THRESHOLD = 3;

export function buildQuery(query: Query): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      const arrayKey = key.endsWith("[]") ? key : `${key}[]`;
      for (const item of value) params.append(arrayKey, item);
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export class MangaDexClient implements MangaDexApi {
  private readonly fetchImpl: typeof fetch;
  private readonly limiter: RateLimiter;
  private readonly atHomeLimiter: RateLimiter;
  private readonly maxRetries: number;
  private readonly breakerMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private breakerUntil = 0;
  private consecutiveForbidden = 0;

  constructor(private readonly options: MangaDexClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.limiter = options.limiter ?? RateLimiter.perSecond(4);
    this.atHomeLimiter = options.atHomeLimiter ?? RateLimiter.perMinute(36);
    this.maxRetries = options.maxRetries ?? 3;
    this.breakerMs = options.breakerMs ?? 60_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? (() => Date.now());
  }

  isAvailable(): boolean {
    return this.now() >= this.breakerUntil;
  }

  get<T>(path: string, query: Query = {}): Promise<T> {
    return this.request<T>(this.limiter, path, query);
  }

  getAtHome<T>(chapterId: string): Promise<T> {
    return this.request<T>(this.atHomeLimiter, `/at-home/server/${encodeURIComponent(chapterId)}`, {});
  }

  private async request<T>(limiter: RateLimiter, path: string, query: Query): Promise<T> {
    if (!this.isAvailable()) throw new MangaDexError(503, "MangaDex is temporarily unavailable");
    const url = `${this.options.baseUrl}${path}${buildQuery(query)}`;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await limiter.schedule(() =>
          this.fetchImpl(url, {
            headers: { "User-Agent": this.options.userAgent, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          }),
        );
      } catch {
        if (attempt < this.maxRetries) {
          await this.sleep(1000 * 2 ** attempt);
          continue;
        }
        throw new MangaDexError(502, `MangaDex request failed for ${path}`);
      }

      if (res.ok) {
        this.consecutiveForbidden = 0;
        return (await res.json()) as T;
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        await this.sleep(this.backoffFor(res, attempt));
        continue;
      }

      if (res.status === 403) {
        this.consecutiveForbidden += 1;
        if (this.consecutiveForbidden >= BREAKER_THRESHOLD) {
          this.breakerUntil = this.now() + this.breakerMs;
          this.consecutiveForbidden = 0;
        }
      }

      if (res.status >= 500 && attempt < this.maxRetries) {
        await this.sleep(1000 * 2 ** attempt);
        continue;
      }

      throw new MangaDexError(res.status, `MangaDex responded ${res.status} for ${path}`);
    }
  }

  private backoffFor(res: Response, attempt: number): number {
    let wait = 1000 * 2 ** attempt;
    // X-RateLimit-Retry-After is a unix timestamp in seconds.
    const retryAt = Number(res.headers.get("x-ratelimit-retry-after"));
    if (Number.isFinite(retryAt) && retryAt > 0) wait = Math.max(wait, retryAt * 1000 - this.now());
    // Retry-After is a delay in seconds.
    const retryAfter = Number(res.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) wait = Math.max(wait, retryAfter * 1000);
    return Math.min(wait, MAX_BACKOFF_MS);
  }
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test -w @manix/server -- mangadex-client rate-limiter`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/server
git commit -m "feat(server): add rate-limited MangaDex client with backoff and circuit breaker"
```

---

### Task 4: MangaDex types, fixtures, and mappers

**Files:**
- Create: `apps/server/src/modules/sources/mangadex/types.ts`, `apps/server/src/modules/sources/mangadex/mappers.ts`
- Create: `apps/server/test/fixtures/manga.json`, `apps/server/test/fixtures/chapters.json`, `apps/server/test/fixtures/at-home.json`
- Create: `apps/server/test/helpers/fixtures.ts`
- Test: `apps/server/test/mappers.test.ts`

**Interfaces:**
- Consumes: `TagDTO`, `GroupDTO`, `ContentSource` from `@manix/shared`.
- Produces:
  - Raw types `LocalizedString`, `MdRelationship`, `MdManga`, `MdChapter`, `MdEntityResponse<T>`, `MdCollectionResponse<T>`, `MdAtHomeResponse`.
  - `interface MangaRecord { source; sourceId; title; altTitles: string[]; description; originalLanguage; status; year: number | null; tags: TagDTO[]; contentRating; coverFile: string | null; authors: string[]; artists: string[]; sourceUpdatedAt: Date | null }`.
  - `interface ChapterRecord { source; sourceId; mangaSourceId; number: string | null; volume: string | null; title: string | null; language; pages: number; sortKey: number; groups: GroupDTO[]; externalUrl: string | null; publishedAt: Date }`.
  - `pickLocalized(map, preferred?)`, `mapManga(raw: MdManga): MangaRecord`, `mapChapter(raw: MdChapter): ChapterRecord`.
  - Fixture helpers: `MANGA_ID`, `CH1`, `CH2A`, `CH2B`, `CH3`, `GROUP_A`, `GROUP_B`, `COVER_FILE`, `mangaEntity()`, `chapterFeed()`, `chapterEntity(id)`, `atHome()`, `standardHandlers()`.

Fixture layout used by later tasks: chapter 1 (`CH1`, Alpha Scans), chapter 2 twice (`CH2A` Alpha Scans published first, `CH2B` Beta Group published later), chapter 3 (`CH3`, Alpha Scans). The feed lists them out of order on purpose.

- [ ] **Step 1: Create fixtures**

`apps/server/test/fixtures/manga.json`:
```json
{
  "result": "ok",
  "data": {
    "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0",
    "type": "manga",
    "attributes": {
      "title": { "en": "Solo Leveling" },
      "altTitles": [{ "ko": "Na Honjaman Rebeleop (ko)" }, { "ko-ro": "Na Honjaman Rebeleop" }, { "en": "Solo Leveling" }],
      "description": { "ko": "Korean description", "en": "10 years ago, after the Gate appeared." },
      "originalLanguage": "ko",
      "status": "completed",
      "year": 2018,
      "contentRating": "safe",
      "tags": [
        { "id": "391b0423-d847-456f-aff0-8b0cfc03066b", "type": "tag", "attributes": { "name": { "en": "Action" }, "group": "genre" } },
        { "id": "cdc58593-87dd-415e-bbc0-2ec27bf404cc", "type": "tag", "attributes": { "name": { "en": "Fantasy" }, "group": "genre" } }
      ],
      "updatedAt": "2024-05-01T10:00:00+00:00"
    },
    "relationships": [
      { "id": "0d1f2a77-4a7e-4d2c-9a55-5b0f1e3c1a01", "type": "author", "attributes": { "name": "Chugong" } },
      { "id": "0d1f2a77-4a7e-4d2c-9a55-5b0f1e3c1a02", "type": "artist", "attributes": { "name": "DUBU (REDICE STUDIO)" } },
      { "id": "0d1f2a77-4a7e-4d2c-9a55-5b0f1e3c1a03", "type": "cover_art", "attributes": { "fileName": "e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg" } }
    ]
  }
}
```

`apps/server/test/fixtures/chapters.json`:
```json
{
  "result": "ok",
  "limit": 500,
  "offset": 0,
  "total": 4,
  "data": [
    {
      "id": "c0000000-0000-4000-8000-000000000004",
      "type": "chapter",
      "attributes": { "volume": "1", "chapter": "3", "title": "Chapter Three", "translatedLanguage": "en", "externalUrl": null, "publishAt": "2024-01-03T00:00:00+00:00", "pages": 2 },
      "relationships": [
        { "id": "aaaaaaaa-0000-4000-8000-000000000001", "type": "scanlation_group", "attributes": { "name": "Alpha Scans" } },
        { "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0", "type": "manga" }
      ]
    },
    {
      "id": "c0000000-0000-4000-8000-000000000001",
      "type": "chapter",
      "attributes": { "volume": "1", "chapter": "1", "title": "The Weakest Hunter", "translatedLanguage": "en", "externalUrl": null, "publishAt": "2024-01-01T00:00:00+00:00", "pages": 2 },
      "relationships": [
        { "id": "aaaaaaaa-0000-4000-8000-000000000001", "type": "scanlation_group", "attributes": { "name": "Alpha Scans" } },
        { "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0", "type": "manga" }
      ]
    },
    {
      "id": "c0000000-0000-4000-8000-000000000003",
      "type": "chapter",
      "attributes": { "volume": "1", "chapter": "2", "title": null, "translatedLanguage": "en", "externalUrl": null, "publishAt": "2024-01-02T12:00:00+00:00", "pages": 2 },
      "relationships": [
        { "id": "bbbbbbbb-0000-4000-8000-000000000002", "type": "scanlation_group", "attributes": { "name": "Beta Group" } },
        { "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0", "type": "manga" }
      ]
    },
    {
      "id": "c0000000-0000-4000-8000-000000000002",
      "type": "chapter",
      "attributes": { "volume": "1", "chapter": "2", "title": "Double Dungeon", "translatedLanguage": "en", "externalUrl": null, "publishAt": "2024-01-02T00:00:00+00:00", "pages": 2 },
      "relationships": [
        { "id": "aaaaaaaa-0000-4000-8000-000000000001", "type": "scanlation_group", "attributes": { "name": "Alpha Scans" } },
        { "id": "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0", "type": "manga" }
      ]
    }
  ]
}
```

`apps/server/test/fixtures/at-home.json`:
```json
{
  "result": "ok",
  "baseUrl": "https://node1.example-mdah.net:443/token123",
  "chapter": {
    "hash": "3303dd03ac8d27452cce3f2a882e94b2",
    "data": ["1-aaa.png", "2-bbb.png"],
    "dataSaver": ["1-aaa.jpg", "2-bbb.jpg"]
  }
}
```

- [ ] **Step 2: Create raw MangaDex types**

`apps/server/src/modules/sources/mangadex/types.ts`:
```ts
export type LocalizedString = Record<string, string>;

export interface MdRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MdTag {
  id: string;
  type: "tag";
  attributes: { name: LocalizedString; group: string };
}

export interface MdManga {
  id: string;
  type: "manga";
  attributes: {
    title: LocalizedString;
    altTitles: LocalizedString[];
    description: LocalizedString;
    originalLanguage: string;
    status: string;
    year: number | null;
    contentRating: string;
    tags: MdTag[];
    updatedAt: string;
  };
  relationships: MdRelationship[];
}

export interface MdChapter {
  id: string;
  type: "chapter";
  attributes: {
    volume: string | null;
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    externalUrl: string | null;
    publishAt: string;
    pages: number;
  };
  relationships: MdRelationship[];
}

export interface MdEntityResponse<T> {
  result: "ok";
  data: T;
}

export interface MdCollectionResponse<T> {
  result: "ok";
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface MdAtHomeResponse {
  result: "ok";
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}
```

- [ ] **Step 3: Create fixture helpers**

`apps/server/test/helpers/fixtures.ts`:
```ts
import type {
  MdAtHomeResponse,
  MdChapter,
  MdCollectionResponse,
  MdEntityResponse,
  MdManga,
} from "../../src/modules/sources/mangadex/types";
import atHomeJson from "../fixtures/at-home.json";
import chaptersJson from "../fixtures/chapters.json";
import mangaJson from "../fixtures/manga.json";

export const MANGA_ID = "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0";
export const CH1 = "c0000000-0000-4000-8000-000000000001";
export const CH2A = "c0000000-0000-4000-8000-000000000002";
export const CH2B = "c0000000-0000-4000-8000-000000000003";
export const CH3 = "c0000000-0000-4000-8000-000000000004";
export const GROUP_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const GROUP_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const COVER_FILE = "e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg";

export const mangaEntity = () => structuredClone(mangaJson) as unknown as MdEntityResponse<MdManga>;

export const chapterFeed = () => structuredClone(chaptersJson) as unknown as MdCollectionResponse<MdChapter>;

export function chapterEntity(id: string): MdEntityResponse<MdChapter> {
  const chapter = chapterFeed().data.find((c) => c.id === id);
  if (!chapter) throw new Error(`No fixture chapter ${id}`);
  return { result: "ok", data: chapter };
}

export const atHome = () => structuredClone(atHomeJson) as unknown as MdAtHomeResponse;

export function standardHandlers(): Record<string, unknown> {
  return {
    [`/manga/${MANGA_ID}`]: mangaEntity(),
    [`/manga/${MANGA_ID}/feed`]: chapterFeed(),
    [`/chapter/${CH1}`]: chapterEntity(CH1),
    [`/chapter/${CH2A}`]: chapterEntity(CH2A),
    [`/chapter/${CH2B}`]: chapterEntity(CH2B),
    [`/chapter/${CH3}`]: chapterEntity(CH3),
  };
}
```

- [ ] **Step 4: Write the failing mapper test**

`apps/server/test/mappers.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { mapChapter, mapManga, pickLocalized } from "../src/modules/sources/mangadex/mappers";
import { CH1, CH2B, chapterEntity, COVER_FILE, GROUP_A, MANGA_ID, mangaEntity } from "./helpers/fixtures";

describe("pickLocalized", () => {
  it("prefers English, then romanized, then anything", () => {
    expect(pickLocalized({ ko: "native", en: "Me" })).toBe("Me");
    expect(pickLocalized({ ko: "native", "ko-ro": "Na" })).toBe("Na");
    expect(pickLocalized({ ko: "native" })).toBe("native");
    expect(pickLocalized({})).toBe("");
    expect(pickLocalized(undefined)).toBe("");
  });
});

describe("mapManga", () => {
  it("maps a MangaDex manga to a cache record", () => {
    expect(mapManga(mangaEntity().data)).toEqual({
      source: "mangadex",
      sourceId: MANGA_ID,
      title: "Solo Leveling",
      altTitles: ["Na Honjaman Rebeleop (ko)", "Na Honjaman Rebeleop"],
      description: "10 years ago, after the Gate appeared.",
      originalLanguage: "ko",
      status: "completed",
      year: 2018,
      tags: [
        { id: "391b0423-d847-456f-aff0-8b0cfc03066b", name: "Action", group: "genre" },
        { id: "cdc58593-87dd-415e-bbc0-2ec27bf404cc", name: "Fantasy", group: "genre" },
      ],
      contentRating: "safe",
      coverFile: COVER_FILE,
      authors: ["Chugong"],
      artists: ["DUBU (REDICE STUDIO)"],
      sourceUpdatedAt: new Date("2024-05-01T10:00:00+00:00"),
    });
  });

  it("falls back to Untitled and a null cover", () => {
    const raw = mangaEntity().data;
    raw.attributes.title = {};
    raw.relationships = [];
    const record = mapManga(raw);
    expect(record.title).toBe("Untitled");
    expect(record.coverFile).toBeNull();
  });
});

describe("mapChapter", () => {
  it("maps a chapter with groups, manga id, and numeric sort key", () => {
    expect(mapChapter(chapterEntity(CH1).data)).toEqual({
      source: "mangadex",
      sourceId: CH1,
      mangaSourceId: MANGA_ID,
      number: "1",
      volume: "1",
      title: "The Weakest Hunter",
      language: "en",
      pages: 2,
      sortKey: 1,
      groups: [{ id: GROUP_A, name: "Alpha Scans" }],
      externalUrl: null,
      publishedAt: new Date("2024-01-01T00:00:00+00:00"),
    });
  });

  it("sorts unnumbered chapters last", () => {
    const raw = chapterEntity(CH2B).data;
    raw.attributes.chapter = null;
    expect(mapChapter(raw).sortKey).toBe(Number.MAX_SAFE_INTEGER);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -w @manix/server -- mappers`
Expected: FAIL, cannot resolve `../src/modules/sources/mangadex/mappers`.

- [ ] **Step 6: Implement mappers**

`apps/server/src/modules/sources/mangadex/mappers.ts`:
```ts
import type { ContentSource, GroupDTO, TagDTO } from "@manix/shared";
import type { LocalizedString, MdChapter, MdManga, MdRelationship } from "./types";

export interface MangaRecord {
  source: ContentSource;
  sourceId: string;
  title: string;
  altTitles: string[];
  description: string;
  originalLanguage: string;
  status: string;
  year: number | null;
  tags: TagDTO[];
  contentRating: string;
  coverFile: string | null;
  authors: string[];
  artists: string[];
  sourceUpdatedAt: Date | null;
}

export interface ChapterRecord {
  source: ContentSource;
  sourceId: string;
  mangaSourceId: string;
  number: string | null;
  volume: string | null;
  title: string | null;
  language: string;
  pages: number;
  sortKey: number;
  groups: GroupDTO[];
  externalUrl: string | null;
  publishedAt: Date;
}

const PREFERRED_LANGUAGES = ["en", "ko-ro", "ja-ro", "zh-ro"];

export function pickLocalized(map: LocalizedString | undefined, preferred = PREFERRED_LANGUAGES): string {
  if (!map) return "";
  for (const lang of preferred) {
    if (map[lang]) return map[lang];
  }
  return Object.values(map)[0] ?? "";
}

function relationshipNames(relationships: MdRelationship[], type: string): string[] {
  return relationships
    .filter((r) => r.type === type)
    .map((r) => (typeof r.attributes?.name === "string" ? r.attributes.name : ""))
    .filter(Boolean);
}

export function mapManga(raw: MdManga): MangaRecord {
  const a = raw.attributes;
  const title = pickLocalized(a.title) || "Untitled";
  const altTitles = [...new Set(a.altTitles.flatMap((t) => Object.values(t)))].filter((t) => t !== title);
  const cover = raw.relationships.find((r) => r.type === "cover_art");
  const coverFile = typeof cover?.attributes?.fileName === "string" ? cover.attributes.fileName : null;

  return {
    source: "mangadex",
    sourceId: raw.id,
    title,
    altTitles,
    description: pickLocalized(a.description),
    originalLanguage: a.originalLanguage,
    status: a.status,
    year: a.year ?? null,
    tags: a.tags.map((t) => ({ id: t.id, name: pickLocalized(t.attributes.name), group: t.attributes.group })),
    contentRating: a.contentRating,
    coverFile,
    authors: relationshipNames(raw.relationships, "author"),
    artists: relationshipNames(raw.relationships, "artist"),
    sourceUpdatedAt: a.updatedAt ? new Date(a.updatedAt) : null,
  };
}

export function mapChapter(raw: MdChapter): ChapterRecord {
  const a = raw.attributes;
  const parsed = a.chapter === null ? Number.NaN : Number.parseFloat(a.chapter);
  const manga = raw.relationships.find((r) => r.type === "manga");

  return {
    source: "mangadex",
    sourceId: raw.id,
    mangaSourceId: manga?.id ?? "",
    number: a.chapter,
    volume: a.volume,
    title: a.title,
    language: a.translatedLanguage,
    pages: a.pages,
    sortKey: Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER,
    groups: raw.relationships
      .filter((r) => r.type === "scanlation_group")
      .map((r) => ({ id: r.id, name: typeof r.attributes?.name === "string" ? r.attributes.name : "Unknown group" })),
    externalUrl: a.externalUrl,
    publishedAt: new Date(a.publishAt),
  };
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test -w @manix/server -- mappers` then `npm run typecheck -w @manix/server`
Expected: PASS; typecheck exits 0.

- [ ] **Step 8: Commit**

```bash
git add apps/server
git commit -m "feat(server): add MangaDex response types, fixtures, and mappers"
```

---

### Task 5: Catalog — manga, search, chapters, blocked groups

**Files:**
- Create: `apps/server/src/modules/moderation/blocked-group.model.ts`
- Create: `apps/server/src/modules/catalog/manga.model.ts`, `chapter.model.ts`, `dto.ts`, `catalog.schemas.ts`, `catalog.service.ts`, `catalog.routes.ts`
- Create: `apps/server/test/helpers/fake-mangadex.ts`
- Modify: `apps/server/src/app.ts` (full replacement below)
- Modify: `apps/server/test/helpers/app.ts` (full replacement below)
- Test: `apps/server/test/catalog.test.ts`

**Interfaces:**
- Consumes: `MangaDexApi`, `MangaDexError`, `Query` (Task 3); `mapManga`, `mapChapter`, `MangaRecord`, `ChapterRecord`, raw `Md*` types (Task 4); `HttpError`; fixture helpers.
- Produces:
  - Models: `Manga` (`MangaCache = MangaRecord & { cachedAt }`), `Chapter` (`ChapterCache = ChapterRecord & { cachedAt }`), `FeedCache` (`FeedCacheAttrs`), `BlockedGroup` (`BlockedGroupAttrs { groupSourceId; name; reason; requestedAt }`).
  - `toMangaDTO(record: MangaRecord): MangaDTO`, `toChapterDTO(record: ChapterRecord): ChapterDTO`, `coverUrl(record)` returns `/img/cover/:mangaId/:coverFile.512.jpg`.
  - `searchQuerySchema`, `type SearchParams`, `chaptersQuerySchema`, `pagesQuerySchema`, `uuidParam`.
  - `class CatalogService(md: MangaDexApi, now?)` with `getManga(id): Promise<MangaDTO>`, `search(params): Promise<Paginated<MangaDTO>>`, `listChapters(mangaId, language): Promise<ChapterDTO[]>`, `getChapter(id): Promise<ChapterDetailDTO>`, `assertReadable(chapterId): Promise<void>`.
  - `findNeighbors(sortedSiblings, current): { prev: string | null; next: string | null }`.
  - `catalogRouter({ env, catalog }): Router` mounted at `/api`:
    - `GET /manga` returns `Paginated<MangaDTO>`
    - `GET /manga/:id` returns `{ manga }`
    - `GET /manga/:id/chapters?lang=` returns `{ chapters }`
    - `GET /chapters/:id` returns `{ chapter }`
  - `AppDeps` becomes `{ env: Env; mangadex: MangaDexApi }`. `GET /api/health` returns `{ ok: true, sourceAvailable: boolean }`.
  - Test helper `fakeMangaDex(handlers?, atHomeResponses?)` returns `{ api, get, getAtHome, isAvailable, handlers, atHomeResponses }`. A handler is a value (cloned), an `Error` (thrown), or `(query) => value`.

- [ ] **Step 1: Create the fake MangaDex helper and update the app helper**

`apps/server/test/helpers/fake-mangadex.ts`:
```ts
import { vi } from "vitest";
import { MangaDexError, type MangaDexApi, type Query } from "../../src/modules/sources/mangadex/client";
import type { MdAtHomeResponse } from "../../src/modules/sources/mangadex/types";

export function fakeMangaDex(
  handlers: Record<string, unknown> = {},
  atHomeResponses: Record<string, MdAtHomeResponse | Error> = {},
) {
  const get = vi.fn(async (path: string, query: Query = {}) => {
    const handler = handlers[path];
    if (handler === undefined) throw new MangaDexError(404, `No fake handler for ${path}`);
    if (handler instanceof Error) throw handler;
    if (typeof handler === "function") return (handler as (q: Query) => unknown)(query);
    return structuredClone(handler);
  });

  const getAtHome = vi.fn(async (chapterId: string) => {
    const response = atHomeResponses[chapterId];
    if (response === undefined) throw new MangaDexError(404, `No fake at-home for ${chapterId}`);
    if (response instanceof Error) throw response;
    return structuredClone(response);
  });

  const isAvailable = vi.fn(() => true);
  const api = { get, getAtHome, isAvailable } as unknown as MangaDexApi;
  return { api, get, getAtHome, isAvailable, handlers, atHomeResponses };
}

export type FakeMangaDex = ReturnType<typeof fakeMangaDex>;
```

Replace `apps/server/test/helpers/app.ts`:
```ts
import request from "supertest";
import { createApp, type AppDeps } from "../../src/app";
import { testEnv } from "./env";
import { fakeMangaDex } from "./fake-mangadex";

export type TestApp = ReturnType<typeof createApp>;

export function buildTestApp(deps: Partial<AppDeps> = {}): TestApp {
  return createApp({ env: testEnv(), mangadex: fakeMangaDex().api, ...deps });
}

let userCounter = 0;

export async function registerAgent(app: TestApp) {
  userCounter += 1;
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/register").send({
    email: `user${userCounter}@example.com`,
    username: `user_${userCounter}`,
    password: "password123",
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}
```

- [ ] **Step 2: Write the failing test**

`apps/server/test/catalog.test.ts`:
```ts
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { findNeighbors } from "../src/modules/catalog/catalog.service";
import { Manga } from "../src/modules/catalog/manga.model";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { MangaDexError, type Query } from "../src/modules/sources/mangadex/client";
import { mapChapter } from "../src/modules/sources/mangadex/mappers";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import {
  CH1,
  CH2A,
  CH2B,
  CH3,
  chapterFeed,
  COVER_FILE,
  GROUP_A,
  GROUP_B,
  MANGA_ID,
  mangaEntity,
  standardHandlers,
} from "./helpers/fixtures";

describe("catalog", () => {
  let fake: FakeMangaDex;
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Manga.init(), Chapter.init(), BlockedGroup.init()]);
  });
  beforeEach(() => {
    fake = fakeMangaDex(standardHandlers());
    app = buildTestApp({ mangadex: fake.api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("reports source availability on the health endpoint", async () => {
    fake.isAvailable.mockReturnValue(false);
    const res = await request(app).get("/api/health");
    expect(res.body).toEqual({ ok: true, sourceAvailable: false });
  });

  it("fetches manga details once and then serves them from cache", async () => {
    const first = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(first.status).toBe(200);
    expect(first.body.manga).toMatchObject({
      id: MANGA_ID,
      source: "mangadex",
      title: "Solo Leveling",
      coverUrl: `/img/cover/${MANGA_ID}/${COVER_FILE}.512.jpg`,
    });
    expect(fake.get.mock.calls[0][1]).toMatchObject({ includes: ["cover_art", "author", "artist"] });

    const second = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(second.body.manga.title).toBe("Solo Leveling");
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("serves stale cached manga when MangaDex fails", async () => {
    await request(app).get(`/api/manga/${MANGA_ID}`);
    await Manga.updateOne({ sourceId: MANGA_ID }, { $set: { cachedAt: new Date(0) } });
    fake.handlers[`/manga/${MANGA_ID}`] = new MangaDexError(503, "down");

    const res = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.manga.title).toBe("Solo Leveling");
    expect(fake.get).toHaveBeenCalledTimes(2);
  });

  it("returns 404 for unknown manga and 400 for malformed ids", async () => {
    const unknown = await request(app).get("/api/manga/11111111-1111-4111-8111-111111111111");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("manga_not_found");

    const malformed = await request(app).get("/api/manga/not-a-uuid");
    expect(malformed.status).toBe(400);
  });

  it("returns 502 when MangaDex is down and nothing is cached", async () => {
    fake.handlers[`/manga/${MANGA_ID}`] = new MangaDexError(503, "down");
    const res = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("source_unavailable");
  });

  it("searches MangaDex with filters and caches the results", async () => {
    fake.handlers["/manga"] = (query: Query) => ({
      result: "ok",
      data: [mangaEntity().data],
      limit: 24,
      offset: query.offset,
      total: 1,
    });

    const res = await request(app).get("/api/manga?q=solo&origin=ko&status=completed&page=1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 24 });
    expect(res.body.items[0].id).toBe(MANGA_ID);
    expect(fake.get.mock.calls[0][0]).toBe("/manga");
    expect(fake.get.mock.calls[0][1]).toMatchObject({
      title: "solo",
      offset: 0,
      limit: 24,
      originalLanguage: ["ko"],
      status: ["completed"],
      contentRating: ["safe", "suggestive"],
      availableTranslatedLanguage: ["en"],
      "order[relevance]": "desc",
    });
    expect(await Manga.countDocuments({ sourceId: MANGA_ID })).toBe(1);
  });

  it("orders by follows when there is no search text", async () => {
    fake.handlers["/manga"] = { result: "ok", data: [], limit: 24, offset: 0, total: 0 };
    await request(app).get("/api/manga");
    expect(fake.get.mock.calls[0][1]).toMatchObject({ "order[followedCount]": "desc" });
  });

  it("falls back to cached manga when search fails", async () => {
    await request(app).get(`/api/manga/${MANGA_ID}`);
    fake.handlers["/manga"] = new MangaDexError(503, "down");

    const res = await request(app).get("/api/manga?origin=ko");
    expect(res.status).toBe(200);
    expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([MANGA_ID]);
  });

  it("rejects pages beyond the MangaDex result window", async () => {
    const res = await request(app).get("/api/manga?page=500");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("page_out_of_range");
  });

  it("lists chapters sorted, cached, and without blocked groups", async () => {
    const res = await request(app).get(`/api/manga/${MANGA_ID}/chapters?lang=en`);
    expect(res.status).toBe(200);
    expect(res.body.chapters.map((c: { id: string }) => c.id)).toEqual([CH1, CH2A, CH2B, CH3]);
    expect(res.body.chapters[0].groups).toEqual([{ id: GROUP_A, name: "Alpha Scans" }]);

    await BlockedGroup.create({ groupSourceId: GROUP_B, name: "Beta Group", reason: "removal request" });
    const again = await request(app).get(`/api/manga/${MANGA_ID}/chapters?lang=en`);
    expect(again.body.chapters.map((c: { id: string }) => c.id)).toEqual([CH1, CH2A, CH3]);
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("returns chapter details with prev/next that prefer the same group", async () => {
    const ch1 = await request(app).get(`/api/chapters/${CH1}`);
    expect(ch1.status).toBe(200);
    expect(ch1.body.chapter).toMatchObject({ id: CH1, mangaId: MANGA_ID, prevChapterId: null, nextChapterId: CH2A });

    const ch2b = await request(app).get(`/api/chapters/${CH2B}`);
    expect(ch2b.body.chapter).toMatchObject({ prevChapterId: CH1, nextChapterId: CH3 });

    const ch3 = await request(app).get(`/api/chapters/${CH3}`);
    expect(ch3.body.chapter).toMatchObject({ prevChapterId: CH2A, nextChapterId: null });
  });

  it("hides chapters from blocked groups", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_B, name: "Beta Group", reason: "removal request" });
    const res = await request(app).get(`/api/chapters/${CH2B}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
  });
});

describe("findNeighbors", () => {
  it("skips external chapters", () => {
    const sorted = chapterFeed()
      .data.map(mapChapter)
      .sort((a, b) => a.sortKey - b.sortKey || a.publishedAt.getTime() - b.publishedAt.getTime());
    const current = sorted.find((c) => c.sourceId === CH1)!;
    for (const c of sorted) if (c.sortKey === 2) c.externalUrl = "https://official.example/ch2";
    expect(findNeighbors(sorted, current)).toEqual({ prev: null, next: CH3 });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @manix/server -- catalog`
Expected: FAIL, cannot resolve `../src/modules/catalog/chapter.model`.

- [ ] **Step 4: Implement models**

`apps/server/src/modules/moderation/blocked-group.model.ts`:
```ts
import { Schema, model } from "mongoose";

export interface BlockedGroupAttrs {
  groupSourceId: string;
  name: string;
  reason: string;
  requestedAt: Date;
}

const blockedGroupSchema = new Schema<BlockedGroupAttrs>({
  groupSourceId: { type: String, required: true, unique: true },
  name: { type: String, default: "" },
  reason: { type: String, default: "" },
  requestedAt: { type: Date, default: () => new Date() },
});

export const BlockedGroup = model<BlockedGroupAttrs>("BlockedGroup", blockedGroupSchema);
```

`apps/server/src/modules/catalog/manga.model.ts`:
```ts
import { Schema, model } from "mongoose";
import type { MangaRecord } from "../sources/mangadex/mappers";

export interface MangaCache extends MangaRecord {
  cachedAt: Date;
}

const tagSchema = new Schema({ id: String, name: String, group: String }, { _id: false, id: false });

const mangaSchema = new Schema<MangaCache>({
  source: { type: String, required: true, enum: ["mangadex", "local"] },
  sourceId: { type: String, required: true },
  title: { type: String, required: true },
  altTitles: { type: [String], default: [] },
  description: { type: String, default: "" },
  originalLanguage: { type: String, default: "" },
  status: { type: String, default: "" },
  year: { type: Number, default: null },
  tags: { type: [tagSchema], default: [] },
  contentRating: { type: String, default: "safe" },
  coverFile: { type: String, default: null },
  authors: { type: [String], default: [] },
  artists: { type: [String], default: [] },
  sourceUpdatedAt: { type: Date, default: null },
  cachedAt: { type: Date, required: true },
});

mangaSchema.index({ source: 1, sourceId: 1 }, { unique: true });
mangaSchema.index({ title: "text", altTitles: "text" }, { default_language: "none" });
mangaSchema.index({ sourceUpdatedAt: -1 });

export const Manga = model<MangaCache>("Manga", mangaSchema);
```

`apps/server/src/modules/catalog/chapter.model.ts`:
```ts
import { Schema, model } from "mongoose";
import type { ChapterRecord } from "../sources/mangadex/mappers";

export interface ChapterCache extends ChapterRecord {
  cachedAt: Date;
}

const groupSchema = new Schema({ id: String, name: String }, { _id: false, id: false });

const chapterSchema = new Schema<ChapterCache>({
  source: { type: String, required: true, enum: ["mangadex", "local"] },
  sourceId: { type: String, required: true },
  mangaSourceId: { type: String, required: true },
  number: { type: String, default: null },
  volume: { type: String, default: null },
  title: { type: String, default: null },
  language: { type: String, required: true },
  pages: { type: Number, default: 0 },
  sortKey: { type: Number, required: true },
  groups: { type: [groupSchema], default: [] },
  externalUrl: { type: String, default: null },
  publishedAt: { type: Date, required: true },
  cachedAt: { type: Date, required: true },
});

chapterSchema.index({ source: 1, sourceId: 1 }, { unique: true });
chapterSchema.index({ mangaSourceId: 1, language: 1, sortKey: 1, publishedAt: 1 });

export const Chapter = model<ChapterCache>("Chapter", chapterSchema);

export interface FeedCacheAttrs {
  mangaSourceId: string;
  language: string;
  cachedAt: Date;
}

const feedCacheSchema = new Schema<FeedCacheAttrs>({
  mangaSourceId: { type: String, required: true },
  language: { type: String, required: true },
  cachedAt: { type: Date, required: true },
});

feedCacheSchema.index({ mangaSourceId: 1, language: 1 }, { unique: true });

export const FeedCache = model<FeedCacheAttrs>("FeedCache", feedCacheSchema);
```

- [ ] **Step 5: Implement DTO mapping and request schemas**

`apps/server/src/modules/catalog/dto.ts`:
```ts
import type { ChapterDTO, MangaDTO } from "@manix/shared";
import type { ChapterRecord, MangaRecord } from "../sources/mangadex/mappers";

export function coverUrl(manga: Pick<MangaRecord, "sourceId" | "coverFile">): string | null {
  return manga.coverFile ? `/img/cover/${manga.sourceId}/${manga.coverFile}.512.jpg` : null;
}

export function toMangaDTO(manga: MangaRecord): MangaDTO {
  return {
    id: manga.sourceId,
    source: manga.source,
    title: manga.title,
    altTitles: [...manga.altTitles],
    description: manga.description,
    originalLanguage: manga.originalLanguage,
    status: manga.status,
    year: manga.year ?? null,
    tags: manga.tags.map((t) => ({ id: t.id, name: t.name, group: t.group })),
    contentRating: manga.contentRating,
    coverUrl: coverUrl(manga),
    authors: [...manga.authors],
    artists: [...manga.artists],
    sourceUpdatedAt: manga.sourceUpdatedAt ? new Date(manga.sourceUpdatedAt).toISOString() : null,
  };
}

export function toChapterDTO(chapter: ChapterRecord): ChapterDTO {
  return {
    id: chapter.sourceId,
    mangaId: chapter.mangaSourceId,
    number: chapter.number ?? null,
    volume: chapter.volume ?? null,
    title: chapter.title ?? null,
    language: chapter.language,
    pages: chapter.pages,
    groups: chapter.groups.map((g) => ({ id: g.id, name: g.name })),
    externalUrl: chapter.externalUrl ?? null,
    publishedAt: new Date(chapter.publishedAt).toISOString(),
  };
}
```

`apps/server/src/modules/catalog/catalog.schemas.ts`:
```ts
import { z } from "zod";

const LANGUAGE = /^[a-z]{2}(-[a-z]{2})?$/;

const csv = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []));

export const uuidParam = z.string().uuid();

export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tags: csv.pipe(z.array(z.string().uuid()).max(20)),
  status: csv.pipe(z.array(z.enum(["ongoing", "completed", "hiatus", "cancelled"]))),
  origin: csv.pipe(z.array(z.string().regex(LANGUAGE)).max(5)),
  rating: csv.pipe(z.array(z.enum(["safe", "suggestive", "erotica", "pornographic"]))),
  lang: z.string().regex(LANGUAGE).default("en"),
  order: z.enum(["relevance", "followedCount", "latestUploadedChapter", "createdAt", "rating"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export type SearchParams = z.infer<typeof searchQuerySchema>;

export const chaptersQuerySchema = z.object({
  lang: z.string().regex(LANGUAGE).default("en"),
});

export const pagesQuerySchema = z.object({
  quality: z.enum(["data", "data-saver"]).default("data"),
});
```

- [ ] **Step 6: Implement the catalog service**

`apps/server/src/modules/catalog/catalog.service.ts`:
```ts
import type { ChapterDetailDTO, ChapterDTO, MangaDTO, Paginated } from "@manix/shared";
import { HttpError } from "../../lib/errors";
import { BlockedGroup } from "../moderation/blocked-group.model";
import { MangaDexError, type MangaDexApi } from "../sources/mangadex/client";
import { mapChapter, mapManga, type ChapterRecord, type MangaRecord } from "../sources/mangadex/mappers";
import type { MdChapter, MdCollectionResponse, MdEntityResponse, MdManga } from "../sources/mangadex/types";
import type { SearchParams } from "./catalog.schemas";
import { Chapter, FeedCache, type ChapterCache, type FeedCacheAttrs } from "./chapter.model";
import { toChapterDTO, toMangaDTO } from "./dto";
import { Manga, type MangaCache } from "./manga.model";

export const MANGA_TTL_MS = 6 * 60 * 60 * 1000;
export const CHAPTER_TTL_MS = 60 * 60 * 1000;
export const SEARCH_PAGE_SIZE = 24;
const FEED_PAGE_SIZE = 500;
const MAX_RESULT_WINDOW = 10_000;
const MANGA_INCLUDES = ["cover_art", "author", "artist"];
const DEFAULT_RATINGS = ["safe", "suggestive"];
const ALL_RATINGS = ["safe", "suggestive", "erotica", "pornographic"];

const sourceUnavailable = () => new HttpError(502, "source_unavailable", "The manga source is temporarily unavailable");
const mangaNotFound = () => new HttpError(404, "manga_not_found", "Manga not found");
const chapterNotFound = () => new HttpError(404, "chapter_not_found", "Chapter not found");
const chapterUnavailable = () => new HttpError(404, "chapter_unavailable", "This chapter is not available");

function isBlocked(chapter: Pick<ChapterRecord, "groups">, blocked: Set<string>): boolean {
  return chapter.groups.some((g) => blocked.has(g.id));
}

/** `siblings` must be sorted by sortKey, then publishedAt, ascending. */
export function findNeighbors(
  siblings: ChapterRecord[],
  current: ChapterRecord,
): { prev: string | null; next: string | null } {
  const readable = siblings.filter((c) => !c.externalUrl && c.sourceId !== current.sourceId);
  const groupIds = new Set(current.groups.map((g) => g.id));

  const pick = (candidates: ChapterRecord[]): string | null => {
    if (candidates.length === 0) return null;
    const nearest = candidates.filter((c) => c.sortKey === candidates[0].sortKey);
    const sameGroup = nearest.find((c) => c.groups.some((g) => groupIds.has(g.id)));
    return (sameGroup ?? nearest[0]).sourceId;
  };

  return {
    next: pick(readable.filter((c) => c.sortKey > current.sortKey)),
    prev: pick(readable.filter((c) => c.sortKey < current.sortKey).reverse()),
  };
}

export class CatalogService {
  constructor(
    private readonly md: MangaDexApi,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getManga(id: string): Promise<MangaDTO> {
    const cached = (await Manga.findOne({ source: "mangadex", sourceId: id }).lean()) as MangaCache | null;
    if (cached && this.isFresh(cached.cachedAt, MANGA_TTL_MS)) return toMangaDTO(cached);

    try {
      const res = await this.md.get<MdEntityResponse<MdManga>>(`/manga/${id}`, { includes: MANGA_INCLUDES });
      const record = mapManga(res.data);
      await this.cacheManga([record]);
      return toMangaDTO(record);
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      if (cached) return toMangaDTO(cached);
      if (err.status === 404 || err.status === 400) throw mangaNotFound();
      throw sourceUnavailable();
    }
  }

  async search(params: SearchParams): Promise<Paginated<MangaDTO>> {
    const pageSize = SEARCH_PAGE_SIZE;
    const offset = (params.page - 1) * pageSize;
    if (offset + pageSize > MAX_RESULT_WINDOW) throw new HttpError(400, "page_out_of_range", "Page is out of range");

    const ratings = params.rating.length > 0 ? params.rating : DEFAULT_RATINGS;
    const order = params.order ?? (params.q ? "relevance" : "followedCount");

    try {
      const res = await this.md.get<MdCollectionResponse<MdManga>>("/manga", {
        title: params.q || undefined,
        limit: pageSize,
        offset,
        includes: MANGA_INCLUDES,
        includedTags: params.tags,
        status: params.status,
        originalLanguage: params.origin,
        contentRating: ratings,
        availableTranslatedLanguage: [params.lang],
        hasAvailableChapters: "true",
        [`order[${order}]`]: "desc",
      });
      const records = res.data.map(mapManga);
      await this.cacheManga(records);
      return {
        items: records.map(toMangaDTO),
        total: Math.min(res.total, MAX_RESULT_WINDOW),
        page: params.page,
        pageSize,
      };
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      return this.searchCached(params, ratings, offset, pageSize);
    }
  }

  async listChapters(mangaId: string, language: string): Promise<ChapterDTO[]> {
    await this.ensureFeed(mangaId, language);
    const [chapters, blocked] = await Promise.all([this.chaptersFor(mangaId, language), this.blockedGroupIds()]);
    return chapters.filter((c) => !isBlocked(c, blocked)).map(toChapterDTO);
  }

  async getChapter(id: string): Promise<ChapterDetailDTO> {
    const chapter = await this.findChapter(id);
    const blocked = await this.blockedGroupIds();
    if (isBlocked(chapter, blocked)) throw chapterUnavailable();

    // Neighbors are best-effort: reading still works if the feed can't be refreshed.
    await this.ensureFeed(chapter.mangaSourceId, chapter.language).catch(() => undefined);
    const siblings = (await this.chaptersFor(chapter.mangaSourceId, chapter.language)).filter(
      (c) => !isBlocked(c, blocked),
    );
    const { prev, next } = findNeighbors(siblings, chapter);
    return { ...toChapterDTO(chapter), prevChapterId: prev, nextChapterId: next };
  }

  async assertReadable(chapterId: string): Promise<void> {
    const chapter = await this.findChapter(chapterId);
    if (chapter.externalUrl || isBlocked(chapter, await this.blockedGroupIds())) throw chapterUnavailable();
  }

  private isFresh(cachedAt: Date, ttlMs: number): boolean {
    return this.now() - new Date(cachedAt).getTime() < ttlMs;
  }

  private async cacheManga(records: MangaRecord[]): Promise<void> {
    if (records.length === 0) return;
    const cachedAt = new Date(this.now());
    await Manga.bulkWrite(
      records.map((r) => ({
        updateOne: {
          filter: { source: r.source, sourceId: r.sourceId },
          update: { $set: { ...r, cachedAt } },
          upsert: true,
        },
      })),
    );
  }

  private async searchCached(
    params: SearchParams,
    ratings: string[],
    offset: number,
    pageSize: number,
  ): Promise<Paginated<MangaDTO>> {
    const filter: Record<string, unknown> = { source: "mangadex", contentRating: { $in: ratings } };
    if (params.q) filter.$text = { $search: params.q };
    if (params.status.length > 0) filter.status = { $in: params.status };
    if (params.origin.length > 0) filter.originalLanguage = { $in: params.origin };
    if (params.tags.length > 0) filter["tags.id"] = { $all: params.tags };

    const [docs, total] = await Promise.all([
      Manga.find(filter).sort({ sourceUpdatedAt: -1 }).skip(offset).limit(pageSize).lean(),
      Manga.countDocuments(filter),
    ]);
    return { items: (docs as MangaCache[]).map(toMangaDTO), total, page: params.page, pageSize };
  }

  private async ensureFeed(mangaId: string, language: string): Promise<void> {
    const feed = (await FeedCache.findOne({ mangaSourceId: mangaId, language }).lean()) as FeedCacheAttrs | null;
    if (feed && this.isFresh(feed.cachedAt, CHAPTER_TTL_MS)) return;

    let records: ChapterRecord[];
    try {
      records = await this.fetchFeed(mangaId, language);
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      if (feed) return;
      if (err.status === 404 || err.status === 400) throw mangaNotFound();
      throw sourceUnavailable();
    }

    const cachedAt = new Date(this.now());
    if (records.length > 0) {
      await Chapter.bulkWrite(
        records.map((r) => ({
          updateOne: {
            filter: { source: r.source, sourceId: r.sourceId },
            update: { $set: { ...r, cachedAt } },
            upsert: true,
          },
        })),
      );
    }
    // Chapters not refreshed by this fetch were removed upstream.
    await Chapter.deleteMany({ source: "mangadex", mangaSourceId: mangaId, language, cachedAt: { $lt: cachedAt } });
    await FeedCache.updateOne({ mangaSourceId: mangaId, language }, { $set: { cachedAt } }, { upsert: true });
  }

  private async fetchFeed(mangaId: string, language: string): Promise<ChapterRecord[]> {
    const records: ChapterRecord[] = [];
    for (let offset = 0; offset + FEED_PAGE_SIZE <= MAX_RESULT_WINDOW; offset += FEED_PAGE_SIZE) {
      const res = await this.md.get<MdCollectionResponse<MdChapter>>(`/manga/${mangaId}/feed`, {
        limit: FEED_PAGE_SIZE,
        offset,
        translatedLanguage: [language],
        includes: ["scanlation_group"],
        contentRating: ALL_RATINGS,
        "order[chapter]": "asc",
      });
      records.push(...res.data.map(mapChapter));
      if (res.data.length === 0 || offset + res.data.length >= res.total) break;
    }
    return records;
  }

  private async findChapter(id: string): Promise<ChapterRecord> {
    const cached = (await Chapter.findOne({ source: "mangadex", sourceId: id }).lean()) as ChapterCache | null;
    if (cached && this.isFresh(cached.cachedAt, CHAPTER_TTL_MS)) return cached;

    try {
      const res = await this.md.get<MdEntityResponse<MdChapter>>(`/chapter/${id}`, { includes: ["scanlation_group"] });
      const record = mapChapter(res.data);
      await Chapter.updateOne(
        { source: record.source, sourceId: record.sourceId },
        { $set: { ...record, cachedAt: new Date(this.now()) } },
        { upsert: true },
      );
      return record;
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      if (cached) return cached;
      if (err.status === 404 || err.status === 400) throw chapterNotFound();
      throw sourceUnavailable();
    }
  }

  private async chaptersFor(mangaId: string, language: string): Promise<ChapterCache[]> {
    const docs = await Chapter.find({ source: "mangadex", mangaSourceId: mangaId, language })
      .sort({ sortKey: 1, publishedAt: 1 })
      .lean();
    return docs as ChapterCache[];
  }

  private async blockedGroupIds(): Promise<Set<string>> {
    const rows = await BlockedGroup.find({}, { groupSourceId: 1 }).lean();
    return new Set(rows.map((r) => r.groupSourceId));
  }
}
```

- [ ] **Step 7: Implement routes and wire the app**

`apps/server/src/modules/catalog/catalog.routes.ts`:
```ts
import { Router } from "express";
import type { Env } from "../../config/env";
import { chaptersQuerySchema, searchQuerySchema, uuidParam } from "./catalog.schemas";
import type { CatalogService } from "./catalog.service";

export interface CatalogRouterDeps {
  env: Env;
  catalog: CatalogService;
}

export function catalogRouter({ catalog }: CatalogRouterDeps): Router {
  const router = Router();

  router.get("/manga", async (req, res) => {
    res.json(await catalog.search(searchQuerySchema.parse(req.query)));
  });

  router.get("/manga/:id", async (req, res) => {
    res.json({ manga: await catalog.getManga(uuidParam.parse(req.params.id)) });
  });

  router.get("/manga/:id/chapters", async (req, res) => {
    const { lang } = chaptersQuerySchema.parse(req.query);
    res.json({ chapters: await catalog.listChapters(uuidParam.parse(req.params.id), lang) });
  });

  router.get("/chapters/:id", async (req, res) => {
    res.json({ chapter: await catalog.getChapter(uuidParam.parse(req.params.id)) });
  });

  return router;
}
```

Replace `apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";
import { authenticate } from "./modules/auth/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { CatalogService } from "./modules/catalog/catalog.service";
import type { MangaDexApi } from "./modules/sources/mangadex/client";

export interface AppDeps {
  env: Env;
  mangadex: MangaDexApi;
}

export function createApp({ env, mangadex }: AppDeps) {
  const catalog = new CatalogService(mangadex);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sourceAvailable: mangadex.isAvailable() });
  });
  app.use("/api/auth", authRouter(env));
  app.use("/api", catalogRouter({ env, catalog }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: all tests PASS, including `app.test.ts` and `auth.test.ts`, which now get a default fake MangaDex from `buildTestApp`. Typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add apps/server
git commit -m "feat(server): add cached catalog for manga, search, and chapters with group blocking"
```

---

### Task 6: Chapter page lists (MangaDex@Home)

**Files:**
- Create: `apps/server/src/modules/catalog/chapter-pages.service.ts`
- Modify: `apps/server/src/modules/catalog/catalog.routes.ts` (full replacement below)
- Modify: `apps/server/src/app.ts` (full replacement below)
- Test: `apps/server/test/chapter-pages.test.ts`

**Interfaces:**
- Consumes: `MangaDexApi`, `MangaDexError`, `MdAtHomeResponse`, `CatalogService.assertReadable`, `pagesQuerySchema`, `uuidParam`, `HttpError`.
- Produces:
  - `AT_HOME_TTL_MS = 600_000`; `interface AtHomeEntry { baseUrl; hash; data: string[]; dataSaver: string[]; fetchedAt: number }`.
  - `class ChapterPagesService(md, now?)` with `getAtHome(chapterId, forceRefresh = false): Promise<AtHomeEntry>`, `getPages(chapterId, quality): Promise<ChapterPagesDTO>`, `hasFile(entry, quality, filename): boolean`.
  - `GET /api/chapters/:id/pages?quality=data|data-saver` returns `ChapterPagesDTO` with URLs shaped `/img/ch/:chapterId/:quality/:filename`.
  - `CatalogRouterDeps` becomes `{ env; catalog; pages }`.

- [ ] **Step 1: Write the failing test**

`apps/server/test/chapter-pages.test.ts`:
```ts
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { AT_HOME_TTL_MS, ChapterPagesService } from "../src/modules/catalog/chapter-pages.service";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { MangaDexError } from "../src/modules/sources/mangadex/client";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import { atHome, CH1, GROUP_A, standardHandlers } from "./helpers/fixtures";

describe("GET /api/chapters/:id/pages", () => {
  let fake: FakeMangaDex;
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Chapter.init(), BlockedGroup.init()]);
  });
  beforeEach(() => {
    fake = fakeMangaDex(standardHandlers(), { [CH1]: atHome() });
    app = buildTestApp({ mangadex: fake.api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("returns Manix image URLs and never exposes the MangaDex node", async () => {
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      chapterId: CH1,
      quality: "data",
      pages: [`/img/ch/${CH1}/data/1-aaa.png`, `/img/ch/${CH1}/data/2-bbb.png`],
    });
    expect(JSON.stringify(res.body)).not.toContain("example-mdah.net");
  });

  it("supports data-saver quality", async () => {
    const res = await request(app).get(`/api/chapters/${CH1}/pages?quality=data-saver`);
    expect(res.body.pages).toEqual([`/img/ch/${CH1}/data-saver/1-aaa.jpg`, `/img/ch/${CH1}/data-saver/2-bbb.jpg`]);
  });

  it("caches the at-home response between requests", async () => {
    await request(app).get(`/api/chapters/${CH1}/pages`);
    await request(app).get(`/api/chapters/${CH1}/pages?quality=data-saver`);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);
  });

  it("refuses blocked chapters without calling at-home", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_A, name: "Alpha Scans", reason: "removal request" });
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
    expect(fake.getAtHome).not.toHaveBeenCalled();
  });

  it("returns 502 when at-home fails", async () => {
    fake.atHomeResponses[CH1] = new MangaDexError(503, "down");
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("source_unavailable");
  });
});

describe("ChapterPagesService", () => {
  it("refetches when forced and after the TTL", async () => {
    let now = 0;
    const fake = fakeMangaDex({}, { [CH1]: atHome() });
    const service = new ChapterPagesService(fake.api, () => now);

    await service.getAtHome(CH1);
    await service.getAtHome(CH1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);

    await service.getAtHome(CH1, true);
    expect(fake.getAtHome).toHaveBeenCalledTimes(2);

    now = AT_HOME_TTL_MS + 1;
    await service.getAtHome(CH1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(3);
  });

  it("checks whether a file belongs to the chapter", async () => {
    const service = new ChapterPagesService(fakeMangaDex({}, { [CH1]: atHome() }).api);
    const entry = await service.getAtHome(CH1);
    expect(service.hasFile(entry, "data", "1-aaa.png")).toBe(true);
    expect(service.hasFile(entry, "data-saver", "1-aaa.png")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @manix/server -- chapter-pages`
Expected: FAIL, cannot resolve `../src/modules/catalog/chapter-pages.service`.

- [ ] **Step 3: Implement the pages service**

`apps/server/src/modules/catalog/chapter-pages.service.ts`:
```ts
import type { ChapterPagesDTO, ImageQuality } from "@manix/shared";
import { HttpError } from "../../lib/errors";
import { MangaDexError, type MangaDexApi } from "../sources/mangadex/client";
import type { MdAtHomeResponse } from "../sources/mangadex/types";

/** MangaDex guarantees a baseUrl for 15 minutes; refresh well before that. */
export const AT_HOME_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;

export interface AtHomeEntry {
  baseUrl: string;
  hash: string;
  data: string[];
  dataSaver: string[];
  fetchedAt: number;
}

function filesFor(entry: AtHomeEntry, quality: ImageQuality): string[] {
  return quality === "data" ? entry.data : entry.dataSaver;
}

export class ChapterPagesService {
  private readonly cache = new Map<string, AtHomeEntry>();

  constructor(
    private readonly md: MangaDexApi,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getAtHome(chapterId: string, forceRefresh = false): Promise<AtHomeEntry> {
    const hit = this.cache.get(chapterId);
    if (hit && !forceRefresh && this.now() - hit.fetchedAt < AT_HOME_TTL_MS) return hit;

    let res: MdAtHomeResponse;
    try {
      res = await this.md.getAtHome<MdAtHomeResponse>(chapterId);
    } catch (err) {
      if (err instanceof MangaDexError) {
        throw new HttpError(502, "source_unavailable", "Chapter images are temporarily unavailable");
      }
      throw err;
    }

    const entry: AtHomeEntry = {
      baseUrl: res.baseUrl,
      hash: res.chapter.hash,
      data: res.chapter.data,
      dataSaver: res.chapter.dataSaver,
      fetchedAt: this.now(),
    };
    this.cache.delete(chapterId);
    this.cache.set(chapterId, entry);
    this.prune();
    return entry;
  }

  async getPages(chapterId: string, quality: ImageQuality): Promise<ChapterPagesDTO> {
    const entry = await this.getAtHome(chapterId);
    return {
      chapterId,
      quality,
      pages: filesFor(entry, quality).map((file) => `/img/ch/${chapterId}/${quality}/${encodeURIComponent(file)}`),
    };
  }

  hasFile(entry: AtHomeEntry, quality: ImageQuality, filename: string): boolean {
    return filesFor(entry, quality).includes(filename);
  }

  private prune(): void {
    for (const [key, value] of this.cache) {
      if (this.now() - value.fetchedAt >= AT_HOME_TTL_MS) this.cache.delete(key);
    }
    while (this.cache.size > MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
```

- [ ] **Step 4: Add the pages route and wire the app**

Replace `apps/server/src/modules/catalog/catalog.routes.ts`:
```ts
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { Env } from "../../config/env";
import { HttpError } from "../../lib/errors";
import { chaptersQuerySchema, pagesQuerySchema, searchQuerySchema, uuidParam } from "./catalog.schemas";
import type { CatalogService } from "./catalog.service";
import type { ChapterPagesService } from "./chapter-pages.service";

export interface CatalogRouterDeps {
  env: Env;
  catalog: CatalogService;
  pages: ChapterPagesService;
}

export function catalogRouter({ env, catalog, pages }: CatalogRouterDeps): Router {
  const router = Router();

  // Each page-list request can cost one of our 40/min at-home calls, so cap it per client.
  const pagesLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => env.NODE_ENV === "test",
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many chapters opened, slow down")),
  });

  router.get("/manga", async (req, res) => {
    res.json(await catalog.search(searchQuerySchema.parse(req.query)));
  });

  router.get("/manga/:id", async (req, res) => {
    res.json({ manga: await catalog.getManga(uuidParam.parse(req.params.id)) });
  });

  router.get("/manga/:id/chapters", async (req, res) => {
    const { lang } = chaptersQuerySchema.parse(req.query);
    res.json({ chapters: await catalog.listChapters(uuidParam.parse(req.params.id), lang) });
  });

  router.get("/chapters/:id", async (req, res) => {
    res.json({ chapter: await catalog.getChapter(uuidParam.parse(req.params.id)) });
  });

  router.get("/chapters/:id/pages", pagesLimiter, async (req, res) => {
    const id = uuidParam.parse(req.params.id);
    const { quality } = pagesQuerySchema.parse(req.query);
    await catalog.assertReadable(id);
    res.json(await pages.getPages(id, quality));
  });

  return router;
}
```

Replace `apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";
import { authenticate } from "./modules/auth/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { CatalogService } from "./modules/catalog/catalog.service";
import { ChapterPagesService } from "./modules/catalog/chapter-pages.service";
import type { MangaDexApi } from "./modules/sources/mangadex/client";

export interface AppDeps {
  env: Env;
  mangadex: MangaDexApi;
}

export function createApp({ env, mangadex }: AppDeps) {
  const catalog = new CatalogService(mangadex);
  const pages = new ChapterPagesService(mangadex);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sourceAvailable: mangadex.isAvailable() });
  });
  app.use("/api/auth", authRouter(env));
  app.use("/api", catalogRouter({ env, catalog, pages }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 5: Run all tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "feat(server): serve chapter page lists through cached MangaDex@Home lookups"
```

---

### Task 7: Image proxy with disk cache and @Home reporting

**Files:**
- Create: `apps/server/src/modules/images/disk-cache.ts`, `image.service.ts`, `images.routes.ts`
- Modify: `apps/server/src/app.ts` (full replacement below)
- Test: `apps/server/test/disk-cache.test.ts`, `apps/server/test/images.test.ts`

**Interfaces:**
- Consumes: `ChapterPagesService.getAtHome` / `hasFile`, `AtHomeEntry`, `CatalogService.assertReadable`, `HttpError`, `Env` (`IMAGE_CACHE_DIR`, `IMAGE_CACHE_MAX_GB`, `APP_USER_AGENT`, `MANGADEX_UPLOADS_URL`, `MANGADEX_REPORT_URL`).
- Produces:
  - `class DiskCache(dir, maxBytes, autoEvictIntervalMs = 300_000)` with `pathFor(key): string`, `get(key): Promise<{ path; size } | null>`, `createWriter(key): Promise<{ stream; commit(); abort() }>`, `put(key, data: Uint8Array)`, `evict()`.
  - `class ImageService(options)` with `serveChapterImage(res, chapterId, quality, filename)`, `serveCover(res, mangaId, filename)`; `contentTypeFor(filename)`; `SAFE_FILENAME`, `COVER_FILENAME` regexes.
  - `imagesRouter(images): Router` mounted at `/img`: `GET /ch/:chapterId/:quality/:filename`, `GET /cover/:mangaId/:filename`.
  - Response headers: `Cache-Control: public, max-age=31536000, immutable`, `X-Manix-Cache: HIT|MISS`.
  - `AppDeps` gains `fetchImpl?: typeof fetch` (default: global `fetch`).

- [ ] **Step 1: Write the failing disk cache test**

`apps/server/test/disk-cache.test.ts`:
```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskCache } from "../src/modules/images/disk-cache";

describe("DiskCache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "manix-cache-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("stores entries and reads them back", async () => {
    const cache = new DiskCache(dir, 1024);
    await cache.put("ch/a/data/1.png", Buffer.from("hello"));
    const hit = await cache.get("ch/a/data/1.png");
    expect(hit?.size).toBe(5);
    expect(await fs.readFile(hit!.path, "utf8")).toBe("hello");
  });

  it("returns null on a miss", async () => {
    expect(await new DiskCache(dir, 1024).get("missing")).toBeNull();
  });

  it("leaves no entry and no temp file when a write is aborted", async () => {
    const cache = new DiskCache(dir, 1024);
    const writer = await cache.createWriter("partial");
    writer.stream.write("half an image");
    await writer.abort();
    expect(await cache.get("partial")).toBeNull();
    expect(await fs.readdir(path.dirname(cache.pathFor("partial")))).toEqual([]);
  });

  it("evicts least recently used files once over the size cap", async () => {
    const cache = new DiskCache(dir, 250);
    await cache.put("old", Buffer.alloc(100));
    await cache.put("mid", Buffer.alloc(100));
    await cache.put("new", Buffer.alloc(100));
    const t = Date.now() / 1000;
    await fs.utimes(cache.pathFor("old"), t - 300, t - 300);
    await fs.utimes(cache.pathFor("mid"), t - 200, t - 200);
    await fs.utimes(cache.pathFor("new"), t - 100, t - 100);

    await cache.evict();

    expect(await cache.get("old")).toBeNull();
    expect(await cache.get("mid")).not.toBeNull();
    expect(await cache.get("new")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @manix/server -- disk-cache`
Expected: FAIL, cannot resolve `../src/modules/images/disk-cache`.

- [ ] **Step 3: Implement the disk cache**

`apps/server/src/modules/images/disk-cache.ts`:
```ts
import crypto from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface CacheHit {
  path: string;
  size: number;
}

export interface CacheWriter {
  stream: WriteStream;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

/** Content-addressed file cache. File mtime doubles as last-access time for LRU eviction. */
export class DiskCache {
  private evicting = false;
  private lastEvict = Date.now();

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
    private readonly autoEvictIntervalMs = 5 * 60 * 1000,
  ) {}

  pathFor(key: string): string {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(this.dir, hash.slice(0, 2), hash);
  }

  async get(key: string): Promise<CacheHit | null> {
    const file = this.pathFor(key);
    try {
      const stat = await fs.stat(file);
      const now = new Date();
      void fs.utimes(file, now, now).catch(() => undefined);
      return { path: file, size: stat.size };
    } catch {
      return null;
    }
  }

  async createWriter(key: string): Promise<CacheWriter> {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    const stream = createWriteStream(tmp);

    return {
      stream,
      commit: async () => {
        try {
          await fs.rename(tmp, file);
        } catch (err) {
          // Another request may have cached the same image first (rename fails on Windows).
          await fs.rm(tmp, { force: true });
          if (!(await exists(file))) throw err;
        }
        this.maybeEvict();
      },
      abort: async () => {
        await new Promise<void>((resolve) => {
          if (stream.closed) return resolve();
          stream.once("close", () => resolve());
          stream.destroy();
        });
        await fs.rm(tmp, { force: true });
      },
    };
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const writer = await this.createWriter(key);
    await new Promise<void>((resolve, reject) => {
      writer.stream.once("error", reject);
      writer.stream.end(data, () => resolve());
    });
    await writer.commit();
  }

  async evict(): Promise<void> {
    const files: { file: string; size: number; mtimeMs: number }[] = [];
    const buckets = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const bucket of buckets) {
      const bucketDir = path.join(this.dir, bucket);
      const names = await fs.readdir(bucketDir).catch(() => [] as string[]);
      for (const name of names) {
        if (name.endsWith(".tmp")) continue;
        const file = path.join(bucketDir, name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat?.isFile()) files.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }

    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= this.maxBytes) return;

    const target = this.maxBytes * 0.9;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of files) {
      if (total <= target) break;
      await fs.rm(f.file, { force: true });
      total -= f.size;
    }
  }

  private maybeEvict(): void {
    if (this.evicting || Date.now() - this.lastEvict < this.autoEvictIntervalMs) return;
    this.evicting = true;
    this.lastEvict = Date.now();
    void this.evict()
      .catch((err) => console.error("Image cache eviction failed", err))
      .finally(() => {
        this.evicting = false;
      });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -w @manix/server -- disk-cache`
Expected: 4 tests PASS.

- [ ] **Step 5: Write the failing image proxy test**

`apps/server/test/images.test.ts`:
```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { DiskCache } from "../src/modules/images/disk-cache";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { testEnv } from "./helpers/env";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import { atHome, CH1, COVER_FILE, GROUP_A, MANGA_ID, standardHandlers } from "./helpers/fixtures";

const NODE1 = "https://node1.example-mdah.net:443/token123";
const NODE2 = "https://node2.example-mdah.net:443/token456";
const HASH = "3303dd03ac8d27452cce3f2a882e94b2";
const REPORT_URL = "https://report.mangadex.test/report";
const COVER_UPSTREAM = `https://uploads.mangadex.test/covers/${MANGA_ID}/${COVER_FILE}.512.jpg`;
const PNG = new Uint8Array(Buffer.from("fake-png-bytes-for-page-one"));
const PAGE_URL = `/img/ch/${CH1}/data/1-aaa.png`;

function getBinary(app: TestApp, url: string) {
  return request(app)
    .get(url)
    .buffer(true)
    .parse((res, callback) => {
      const stream = res as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

describe("image proxy", () => {
  let dir: string;
  let fake: FakeMangaDex;
  let fetchImpl: Mock;
  let app: TestApp;

  const callsTo = (url: string) => fetchImpl.mock.calls.filter(([u]) => String(u) === url);

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Chapter.init(), BlockedGroup.init()]);
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "manix-img-"));
    fake = fakeMangaDex(standardHandlers(), { [CH1]: atHome() });
    fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === `${NODE1}/data/${HASH}/1-aaa.png`) {
        return new Response(PNG, { status: 200, headers: { "content-type": "image/png", "x-cache": "MISS" } });
      }
      if (url === REPORT_URL) return new Response(null, { status: 200 });
      if (url === COVER_UPSTREAM) return new Response(new Uint8Array(Buffer.from("cover")), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    app = buildTestApp({
      env: testEnv({ IMAGE_CACHE_DIR: dir }),
      mangadex: fake.api,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  afterEach(async () => {
    await clearTestDb();
    await fs.rm(dir, { recursive: true, force: true });
  });
  afterAll(stopTestDb);

  it("proxies a chapter page, caches it on disk, and reports to the @Home network", async () => {
    const first = await getBinary(app, PAGE_URL);
    expect(first.status).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(first.headers["x-manix-cache"]).toBe("MISS");
    expect(Buffer.compare(first.body as Buffer, Buffer.from(PNG))).toBe(0);

    const [nodeCall] = callsTo(`${NODE1}/data/${HASH}/1-aaa.png`);
    const headers = (nodeCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Manix-Test/0.0");
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();

    await vi.waitFor(() => expect(callsTo(REPORT_URL)).toHaveLength(1));
    const report = JSON.parse(String((callsTo(REPORT_URL)[0][1] as RequestInit).body));
    expect(report).toMatchObject({
      url: `${NODE1}/data/${HASH}/1-aaa.png`,
      success: true,
      bytes: PNG.length,
      cached: false,
    });

    const cachePath = new DiskCache(dir, 1).pathFor(`ch/${CH1}/data/1-aaa.png`);
    await vi.waitFor(() => fs.access(cachePath));

    const second = await getBinary(app, PAGE_URL);
    expect(second.status).toBe(200);
    expect(second.headers["x-manix-cache"]).toBe("HIT");
    expect(Buffer.compare(second.body as Buffer, Buffer.from(PNG))).toBe(0);
    expect(callsTo(`${NODE1}/data/${HASH}/1-aaa.png`)).toHaveLength(1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);
  });

  it("refreshes the at-home server once when a node rejects the request", async () => {
    fake.getAtHome.mockResolvedValueOnce(atHome()).mockResolvedValueOnce({ ...atHome(), baseUrl: NODE2 });
    fetchImpl.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(NODE1)) return new Response(null, { status: 403 });
      if (url === `${NODE2}/data/${HASH}/1-aaa.png`) return new Response(PNG, { status: 200 });
      return new Response(null, { status: 200 });
    });

    const res = await getBinary(app, PAGE_URL);
    expect(res.status).toBe(200);
    expect(fake.getAtHome).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the node keeps failing", async () => {
    fetchImpl.mockImplementation(async () => new Response(null, { status: 500 }));
    const res = await request(app).get(PAGE_URL);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("image_unavailable");
  });

  it("returns 404 for files that are not part of the chapter", async () => {
    const res = await request(app).get(`/img/ch/${CH1}/data/9-zzz.png`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("image_not_found");
  });

  it("rejects unsafe filenames", async () => {
    const res = await request(app).get(`/img/ch/${CH1}/data/..%2F..%2Fsecret`);
    expect(res.status).toBe(400);
  });

  it("refuses images from blocked groups without touching the node", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_A, name: "Alpha Scans", reason: "removal request" });
    const res = await request(app).get(PAGE_URL);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
    expect(callsTo(`${NODE1}/data/${HASH}/1-aaa.png`)).toHaveLength(0);
  });

  it("proxies covers from the uploads server without reporting", async () => {
    const res = await getBinary(app, `/img/cover/${MANGA_ID}/${COVER_FILE}.512.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect((res.body as Buffer).toString()).toBe("cover");
    expect(callsTo(REPORT_URL)).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test -w @manix/server -- images`
Expected: FAIL. `AppDeps` has no `fetchImpl` and `/img` routes return 404.

- [ ] **Step 7: Implement the image service and routes**

`apps/server/src/modules/images/image.service.ts`:
```ts
import type { ImageQuality } from "@manix/shared";
import type { Response as ExpressResponse } from "express";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { HttpError } from "../../lib/errors";
import type { CatalogService } from "../catalog/catalog.service";
import type { AtHomeEntry, ChapterPagesService } from "../catalog/chapter-pages.service";
import type { DiskCache } from "./disk-cache";

const IMMUTABLE = "public, max-age=31536000, immutable";
const UPSTREAM_TIMEOUT_MS = 20_000;
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,200}$/;
export const COVER_FILENAME = /^[A-Za-z0-9-]{1,100}\.(jpg|jpeg|png|webp)(\.(256|512)\.jpg)?$/;

export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export interface ImageServiceOptions {
  cache: DiskCache;
  pages: Pick<ChapterPagesService, "getAtHome" | "hasFile">;
  catalog: Pick<CatalogService, "assertReadable">;
  fetchImpl: typeof fetch;
  userAgent: string;
  uploadsUrl: string;
  reportUrl: string;
  now?: () => number;
}

interface UpstreamAttempt {
  url: string;
  startedAt: number;
  response: Response;
}

function nodeUrl(entry: AtHomeEntry, quality: ImageQuality, filename: string): string {
  return `${entry.baseUrl}/${quality}/${entry.hash}/${filename}`;
}

export class ImageService {
  private readonly now: () => number;

  constructor(private readonly o: ImageServiceOptions) {
    this.now = o.now ?? (() => Date.now());
  }

  async serveChapterImage(
    res: ExpressResponse,
    chapterId: string,
    quality: ImageQuality,
    filename: string,
  ): Promise<void> {
    await this.o.catalog.assertReadable(chapterId);
    const key = `ch/${chapterId}/${quality}/${filename}`;
    if (await this.sendCached(res, key, filename)) return;

    let entry = await this.o.pages.getAtHome(chapterId);
    if (!this.o.pages.hasFile(entry, quality, filename)) {
      throw new HttpError(404, "image_not_found", "Image not found");
    }

    let attempt = await this.fetchUpstream(nodeUrl(entry, quality, filename));
    if (!attempt.response.ok) {
      this.report(attempt, false, 0, false);
      // The baseUrl may have expired; ask MangaDex for a fresh node once.
      entry = await this.o.pages.getAtHome(chapterId, true);
      attempt = await this.fetchUpstream(nodeUrl(entry, quality, filename));
    }
    if (!attempt.response.ok || !attempt.response.body) {
      this.report(attempt, false, 0, false);
      throw new HttpError(502, "image_unavailable", "Image source is unavailable");
    }

    const nodeCached = attempt.response.headers.get("x-cache")?.startsWith("HIT") ?? false;
    try {
      const bytes = await this.streamAndCache(res, attempt.response, key, filename);
      this.report(attempt, true, bytes, nodeCached);
    } catch (err) {
      this.report(attempt, false, 0, nodeCached);
      throw err;
    }
  }

  async serveCover(res: ExpressResponse, mangaId: string, filename: string): Promise<void> {
    const key = `cover/${mangaId}/${filename}`;
    if (await this.sendCached(res, key, filename)) return;

    const { response } = await this.fetchUpstream(`${this.o.uploadsUrl}/covers/${mangaId}/${filename}`);
    if (response.status === 404) throw new HttpError(404, "image_not_found", "Image not found");
    if (!response.ok || !response.body) throw new HttpError(502, "image_unavailable", "Image source is unavailable");
    await this.streamAndCache(res, response, key, filename);
  }

  private async sendCached(res: ExpressResponse, key: string, filename: string): Promise<boolean> {
    const hit = await this.o.cache.get(key);
    if (!hit) return false;
    res.setHeader("Cache-Control", IMMUTABLE);
    res.setHeader("Content-Type", contentTypeFor(filename));
    res.setHeader("Content-Length", String(hit.size));
    res.setHeader("X-Manix-Cache", "HIT");
    await pipeline(createReadStream(hit.path), res);
    return true;
  }

  private async fetchUpstream(url: string): Promise<UpstreamAttempt> {
    const startedAt = this.now();
    try {
      // No Authorization or Cookie headers are ever sent to image servers.
      const response = await this.o.fetchImpl(url, {
        headers: { "User-Agent": this.o.userAgent },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return { url, startedAt, response };
    } catch {
      return { url, startedAt, response: new Response(null, { status: 599 }) };
    }
  }

  private async streamAndCache(
    res: ExpressResponse,
    upstream: Response,
    key: string,
    filename: string,
  ): Promise<number> {
    const lengthHeader = upstream.headers.get("content-length");
    const expected = lengthHeader && !upstream.headers.get("content-encoding") ? Number(lengthHeader) : Number.NaN;

    res.setHeader("Cache-Control", IMMUTABLE);
    res.setHeader("Content-Type", contentTypeFor(filename));
    res.setHeader("X-Manix-Cache", "MISS");
    if (Number.isFinite(expected)) res.setHeader("Content-Length", String(expected));

    const source = Readable.fromWeb(upstream.body as unknown as NodeWebReadableStream<Uint8Array>);
    const writer = await this.o.cache.createWriter(key);
    let bytes = 0;
    source.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
    });
    source.pipe(res);

    try {
      await pipeline(source, writer.stream);
      if (Number.isFinite(expected) && bytes !== expected) {
        throw new Error(`Truncated upstream image: ${bytes}/${expected} bytes`);
      }
      await writer.commit();
      return bytes;
    } catch (err) {
      await writer.abort();
      res.destroy();
      throw err;
    }
  }

  /** MangaDex@Home asks clients to report fetches from non-mangadex.org nodes. */
  private report(attempt: UpstreamAttempt, success: boolean, bytes: number, cached: boolean): void {
    if (new URL(attempt.url).hostname.endsWith("mangadex.org")) return;
    const body = JSON.stringify({
      url: attempt.url,
      success,
      bytes,
      duration: this.now() - attempt.startedAt,
      cached,
    });
    void Promise.resolve()
      .then(() =>
        this.o.fetchImpl(this.o.reportUrl, {
          method: "POST",
          headers: { "User-Agent": this.o.userAgent, "Content-Type": "application/json" },
          body,
        }),
      )
      .catch(() => undefined);
  }
}
```

`apps/server/src/modules/images/images.routes.ts`:
```ts
import { Router } from "express";
import { z } from "zod";
import { COVER_FILENAME, SAFE_FILENAME, type ImageService } from "./image.service";

const chapterImageParams = z.object({
  chapterId: z.string().uuid(),
  quality: z.enum(["data", "data-saver"]),
  filename: z.string().regex(SAFE_FILENAME),
});

const coverParams = z.object({
  mangaId: z.string().uuid(),
  filename: z.string().regex(COVER_FILENAME),
});

export function imagesRouter(images: ImageService): Router {
  const router = Router();

  router.get("/ch/:chapterId/:quality/:filename", async (req, res) => {
    const { chapterId, quality, filename } = chapterImageParams.parse(req.params);
    await images.serveChapterImage(res, chapterId, quality, filename);
  });

  router.get("/cover/:mangaId/:filename", async (req, res) => {
    const { mangaId, filename } = coverParams.parse(req.params);
    await images.serveCover(res, mangaId, filename);
  });

  return router;
}
```

Replace `apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";
import { authenticate } from "./modules/auth/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { CatalogService } from "./modules/catalog/catalog.service";
import { ChapterPagesService } from "./modules/catalog/chapter-pages.service";
import { DiskCache } from "./modules/images/disk-cache";
import { ImageService } from "./modules/images/image.service";
import { imagesRouter } from "./modules/images/images.routes";
import type { MangaDexApi } from "./modules/sources/mangadex/client";

export interface AppDeps {
  env: Env;
  mangadex: MangaDexApi;
  fetchImpl?: typeof fetch;
}

export function createApp({ env, mangadex, fetchImpl = fetch }: AppDeps) {
  const catalog = new CatalogService(mangadex);
  const pages = new ChapterPagesService(mangadex);
  const images = new ImageService({
    cache: new DiskCache(path.resolve(env.IMAGE_CACHE_DIR), env.IMAGE_CACHE_MAX_GB * 1024 ** 3),
    pages,
    catalog,
    fetchImpl,
    userAgent: env.APP_USER_AGENT,
    uploadsUrl: env.MANGADEX_UPLOADS_URL,
    reportUrl: env.MANGADEX_REPORT_URL,
  });

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sourceAvailable: mangadex.isAvailable() });
  });
  app.use("/api/auth", authRouter(env));
  app.use("/api", catalogRouter({ env, catalog, pages }));
  app.use("/img", imagesRouter(images));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add apps/server
git commit -m "feat(server): add disk-cached image proxy with MangaDex@Home reporting"
```

---

### Task 8: Library, reading progress, and history

**Files:**
- Create: `apps/server/src/modules/library/library.model.ts`, `progress.model.ts`, `history.model.ts`, `library.service.ts`, `library.routes.ts`
- Modify: `apps/server/src/app.ts` (full replacement below)
- Test: `apps/server/test/library.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `currentUserId` (Task 2); `CatalogService.getManga`, `Manga`, `MangaCache`, `toMangaDTO`, `uuidParam` (Task 5); `registerAgent`, `fakeMangaDex`, fixtures.
- Produces:
  - Models `LibraryEntry` (`LibraryAttrs`), `Progress` (`ProgressAttrs`), `History` (`HistoryAttrs`).
  - `class LibraryService(catalog: Pick<CatalogService, "getManga">, historyLimit = 500)` with `list`, `get`, `set`, `remove`, `saveProgress`, `getProgress`, `continueReading`, `history`, `trimHistory`.
  - Routes mounted at `/api`, all requiring login:
    - `GET /library?status=` returns `{ entries: LibraryEntryDTO[] }`
    - `GET /library/:mangaId` returns `{ entry: LibraryEntryDTO | null }`
    - `PUT /library/:mangaId` with body `{ status }` returns `{ entry }`
    - `DELETE /library/:mangaId` returns 204
    - `PUT /progress` with body `{ mangaId, chapterId, chapterNumber, page, totalPages }` returns `{ progress: ProgressDTO }`
    - `GET /progress/continue` returns `{ items: ProgressDTO[] }` (latest 12)
    - `GET /progress/:mangaId` returns `{ progress: ProgressDTO | null }`
    - `GET /history?page=` returns `Paginated<HistoryEntryDTO>` (50 per page)

- [ ] **Step 1: Write the failing test**

`apps/server/test/library.test.ts`:
```ts
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/modules/auth/user.model";
import { Manga } from "../src/modules/catalog/manga.model";
import { History } from "../src/modules/library/history.model";
import { LibraryEntry } from "../src/modules/library/library.model";
import { LibraryService } from "../src/modules/library/library.service";
import { Progress } from "../src/modules/library/progress.model";
import { buildTestApp, registerAgent, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex } from "./helpers/fake-mangadex";
import { CH1, CH2A, MANGA_ID, standardHandlers } from "./helpers/fixtures";

describe("library, progress, and history", () => {
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([User.init(), Manga.init(), LibraryEntry.init(), Progress.init(), History.init()]);
  });
  beforeEach(() => {
    app = buildTestApp({ mangadex: fakeMangaDex(standardHandlers()).api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("requires login", async () => {
    const routes = [
      ["get", "/api/library"],
      ["put", `/api/library/${MANGA_ID}`],
      ["put", "/api/progress"],
      ["get", "/api/progress/continue"],
      ["get", "/api/history"],
    ] as const;
    for (const [method, url] of routes) {
      const res = await request(app)[method](url);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it("adds, lists, updates, and removes library entries", async () => {
    const agent = await registerAgent(app);

    const added = await agent.put(`/api/library/${MANGA_ID}`).send({ status: "reading" });
    expect(added.status).toBe(200);
    expect(added.body.entry).toMatchObject({ mangaId: MANGA_ID, status: "reading", manga: { title: "Solo Leveling" } });

    await agent.put(`/api/library/${MANGA_ID}`).send({ status: "completed" });
    const list = await agent.get("/api/library");
    expect(list.body.entries).toHaveLength(1);
    expect(list.body.entries[0]).toMatchObject({ status: "completed", manga: { id: MANGA_ID } });
    expect((await agent.get("/api/library?status=reading")).body.entries).toHaveLength(0);
    expect((await agent.get(`/api/library/${MANGA_ID}`)).body.entry.status).toBe("completed");

    expect((await agent.delete(`/api/library/${MANGA_ID}`)).status).toBe(204);
    expect((await agent.get(`/api/library/${MANGA_ID}`)).body.entry).toBeNull();
  });

  it("keeps each user's library private", async () => {
    const alice = await registerAgent(app);
    const bob = await registerAgent(app);
    await alice.put(`/api/library/${MANGA_ID}`).send({ status: "reading" });
    expect((await bob.get("/api/library")).body.entries).toEqual([]);
  });

  it("rejects unknown manga and invalid statuses", async () => {
    const agent = await registerAgent(app);
    const unknown = await agent.put("/api/library/11111111-1111-4111-8111-111111111111").send({ status: "reading" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("manga_not_found");

    const invalid = await agent.put(`/api/library/${MANGA_ID}`).send({ status: "binge" });
    expect(invalid.status).toBe(400);
  });

  it("saves progress, powers continue reading, and records history", async () => {
    const agent = await registerAgent(app);

    const saved = await agent
      .put("/api/progress")
      .send({ mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 3, totalPages: 20 });
    expect(saved.status).toBe(200);
    expect(saved.body.progress).toMatchObject({ mangaId: MANGA_ID, chapterId: CH1, page: 3, totalPages: 20 });
    await History.updateOne({ chapterSourceId: CH1 }, { $set: { readAt: new Date(Date.now() - 60_000) } });

    await agent
      .put("/api/progress")
      .send({ mangaId: MANGA_ID, chapterId: CH2A, chapterNumber: "2", page: 0, totalPages: 18 });

    const current = await agent.get(`/api/progress/${MANGA_ID}`);
    expect(current.body.progress).toMatchObject({ chapterId: CH2A, chapterNumber: "2", page: 0 });

    const continueReading = await agent.get("/api/progress/continue");
    expect(continueReading.body.items).toHaveLength(1);
    expect(continueReading.body.items[0].manga.title).toBe("Solo Leveling");

    const history = await agent.get("/api/history");
    expect(history.body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
    expect(history.body.items.map((h: { chapterId: string }) => h.chapterId)).toEqual([CH2A, CH1]);
  });

  it("records each chapter once in history", async () => {
    const agent = await registerAgent(app);
    const body = { mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 1, totalPages: 20 };
    await agent.put("/api/progress").send(body);
    await agent.put("/api/progress").send({ ...body, page: 5 });
    expect((await agent.get("/api/history")).body.total).toBe(1);
  });

  it("trims history to the configured limit, keeping the newest entries", async () => {
    const agent = await registerAgent(app);
    await agent.put("/api/progress").send({ mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 1, totalPages: 20 });
    const user = await User.findOne({}).lean();
    const userId = String(user!._id);
    await History.insertMany(
      Array.from({ length: 5 }, (_, i) => ({
        userId,
        mangaSourceId: MANGA_ID,
        chapterSourceId: `older-${i}`,
        readAt: new Date(Date.now() - (i + 1) * 60_000),
      })),
    );

    const service = new LibraryService({ getManga: async () => Promise.reject(new Error("unused")) }, 3);
    await service.trimHistory(userId);

    const remaining = await History.find({ userId }).sort({ readAt: -1 }).lean();
    expect(remaining.map((h) => h.chapterSourceId)).toEqual([CH1, "older-0", "older-1"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w @manix/server -- library`
Expected: FAIL, cannot resolve `../src/modules/library/history.model`.

- [ ] **Step 3: Implement models**

`apps/server/src/modules/library/library.model.ts`:
```ts
import type { ReadingStatus } from "@manix/shared";
import { Schema, model, type Types } from "mongoose";

export interface LibraryAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  status: ReadingStatus;
  createdAt: Date;
  updatedAt: Date;
}

const librarySchema = new Schema<LibraryAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mangaSourceId: { type: String, required: true },
    status: { type: String, enum: ["reading", "plan", "completed", "dropped"], required: true },
  },
  { timestamps: true },
);

librarySchema.index({ userId: 1, mangaSourceId: 1 }, { unique: true });
librarySchema.index({ userId: 1, updatedAt: -1 });

export const LibraryEntry = model<LibraryAttrs>("LibraryEntry", librarySchema);
```

`apps/server/src/modules/library/progress.model.ts`:
```ts
import { Schema, model, type Types } from "mongoose";

export interface ProgressAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  chapterSourceId: string;
  chapterNumber: string | null;
  page: number;
  totalPages: number;
  createdAt: Date;
  updatedAt: Date;
}

const progressSchema = new Schema<ProgressAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mangaSourceId: { type: String, required: true },
    chapterSourceId: { type: String, required: true },
    chapterNumber: { type: String, default: null },
    page: { type: Number, required: true, min: 0 },
    totalPages: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

progressSchema.index({ userId: 1, mangaSourceId: 1 }, { unique: true });
progressSchema.index({ userId: 1, updatedAt: -1 });

export const Progress = model<ProgressAttrs>("Progress", progressSchema);
```

`apps/server/src/modules/library/history.model.ts`:
```ts
import { Schema, model, type Types } from "mongoose";

export interface HistoryAttrs {
  userId: Types.ObjectId;
  mangaSourceId: string;
  chapterSourceId: string;
  readAt: Date;
}

const historySchema = new Schema<HistoryAttrs>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  mangaSourceId: { type: String, required: true },
  chapterSourceId: { type: String, required: true },
  readAt: { type: Date, required: true },
});

historySchema.index({ userId: 1, chapterSourceId: 1 }, { unique: true });
historySchema.index({ userId: 1, readAt: -1 });

export const History = model<HistoryAttrs>("History", historySchema);
```

- [ ] **Step 4: Implement the service**

`apps/server/src/modules/library/library.service.ts`:
```ts
import type { HistoryEntryDTO, LibraryEntryDTO, MangaDTO, Paginated, ProgressDTO, ReadingStatus } from "@manix/shared";
import type { CatalogService } from "../catalog/catalog.service";
import { toMangaDTO } from "../catalog/dto";
import { Manga, type MangaCache } from "../catalog/manga.model";
import { History, type HistoryAttrs } from "./history.model";
import { LibraryEntry, type LibraryAttrs } from "./library.model";
import { Progress, type ProgressAttrs } from "./progress.model";

export const HISTORY_LIMIT = 500;
export const HISTORY_PAGE_SIZE = 50;
export const CONTINUE_LIMIT = 12;

export interface ProgressInput {
  mangaId: string;
  chapterId: string;
  chapterNumber: string | null;
  page: number;
  totalPages: number;
}

/** Joins cached manga only; library pages never trigger MangaDex calls. */
async function mangaById(ids: string[]): Promise<Map<string, MangaDTO>> {
  if (ids.length === 0) return new Map();
  const docs = (await Manga.find({ source: "mangadex", sourceId: { $in: [...new Set(ids)] } }).lean()) as MangaCache[];
  return new Map(docs.map((doc) => [doc.sourceId, toMangaDTO(doc)]));
}

function toLibraryDTO(entry: LibraryAttrs, manga: MangaDTO | null): LibraryEntryDTO {
  return {
    mangaId: entry.mangaSourceId,
    status: entry.status,
    updatedAt: new Date(entry.updatedAt).toISOString(),
    manga,
  };
}

function toProgressDTO(progress: ProgressAttrs, manga: MangaDTO | null): ProgressDTO {
  return {
    mangaId: progress.mangaSourceId,
    chapterId: progress.chapterSourceId,
    chapterNumber: progress.chapterNumber ?? null,
    page: progress.page,
    totalPages: progress.totalPages,
    updatedAt: new Date(progress.updatedAt).toISOString(),
    manga,
  };
}

export class LibraryService {
  constructor(
    private readonly catalog: Pick<CatalogService, "getManga">,
    private readonly historyLimit = HISTORY_LIMIT,
  ) {}

  async list(userId: string, status?: ReadingStatus): Promise<LibraryEntryDTO[]> {
    const filter: Record<string, unknown> = { userId };
    if (status) filter.status = status;
    const entries = (await LibraryEntry.find(filter).sort({ updatedAt: -1 }).lean()) as LibraryAttrs[];
    const manga = await mangaById(entries.map((e) => e.mangaSourceId));
    return entries.map((e) => toLibraryDTO(e, manga.get(e.mangaSourceId) ?? null));
  }

  async get(userId: string, mangaId: string): Promise<LibraryEntryDTO | null> {
    const entry = (await LibraryEntry.findOne({ userId, mangaSourceId: mangaId }).lean()) as LibraryAttrs | null;
    if (!entry) return null;
    const manga = await mangaById([mangaId]);
    return toLibraryDTO(entry, manga.get(mangaId) ?? null);
  }

  async set(userId: string, mangaId: string, status: ReadingStatus): Promise<LibraryEntryDTO> {
    const manga = await this.catalog.getManga(mangaId);
    const entry = (await LibraryEntry.findOneAndUpdate(
      { userId, mangaSourceId: mangaId },
      { $set: { status } },
      { upsert: true, new: true },
    ).lean()) as LibraryAttrs;
    return toLibraryDTO(entry, manga);
  }

  async remove(userId: string, mangaId: string): Promise<void> {
    await LibraryEntry.deleteOne({ userId, mangaSourceId: mangaId });
  }

  async saveProgress(userId: string, input: ProgressInput): Promise<ProgressDTO> {
    const manga = await this.catalog.getManga(input.mangaId);
    const progress = (await Progress.findOneAndUpdate(
      { userId, mangaSourceId: input.mangaId },
      {
        $set: {
          chapterSourceId: input.chapterId,
          chapterNumber: input.chapterNumber,
          page: input.page,
          totalPages: input.totalPages,
        },
      },
      { upsert: true, new: true },
    ).lean()) as ProgressAttrs;

    await History.updateOne(
      { userId, chapterSourceId: input.chapterId },
      { $set: { mangaSourceId: input.mangaId, readAt: new Date() } },
      { upsert: true },
    );
    await this.trimHistory(userId);
    return toProgressDTO(progress, manga);
  }

  async getProgress(userId: string, mangaId: string): Promise<ProgressDTO | null> {
    const progress = (await Progress.findOne({ userId, mangaSourceId: mangaId }).lean()) as ProgressAttrs | null;
    if (!progress) return null;
    const manga = await mangaById([mangaId]);
    return toProgressDTO(progress, manga.get(mangaId) ?? null);
  }

  async continueReading(userId: string, limit = CONTINUE_LIMIT): Promise<ProgressDTO[]> {
    const rows = (await Progress.find({ userId }).sort({ updatedAt: -1 }).limit(limit).lean()) as ProgressAttrs[];
    const manga = await mangaById(rows.map((r) => r.mangaSourceId));
    return rows.map((r) => toProgressDTO(r, manga.get(r.mangaSourceId) ?? null));
  }

  async history(userId: string, page: number): Promise<Paginated<HistoryEntryDTO>> {
    const pageSize = HISTORY_PAGE_SIZE;
    const [docs, total] = await Promise.all([
      History.find({ userId })
        .sort({ readAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      History.countDocuments({ userId }),
    ]);
    const rows = docs as HistoryAttrs[];
    const manga = await mangaById(rows.map((r) => r.mangaSourceId));
    return {
      items: rows.map((r) => ({
        mangaId: r.mangaSourceId,
        chapterId: r.chapterSourceId,
        readAt: new Date(r.readAt).toISOString(),
        manga: manga.get(r.mangaSourceId) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async trimHistory(userId: string): Promise<void> {
    const overflow = await History.find({ userId })
      .sort({ readAt: -1 })
      .skip(this.historyLimit)
      .select({ _id: 1 })
      .lean();
    if (overflow.length > 0) {
      await History.deleteMany({ _id: { $in: overflow.map((h) => h._id) } });
    }
  }
}
```

- [ ] **Step 5: Implement routes and wire the app**

`apps/server/src/modules/library/library.routes.ts`:
```ts
import { Router } from "express";
import { z } from "zod";
import { currentUserId, requireAuth } from "../auth/auth.middleware";
import { uuidParam } from "../catalog/catalog.schemas";
import type { LibraryService } from "./library.service";

const readingStatus = z.enum(["reading", "plan", "completed", "dropped"]);
const listQuery = z.object({ status: readingStatus.optional() });
const statusBody = z.object({ status: readingStatus });
const historyQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });
const progressBody = z.object({
  mangaId: z.string().uuid(),
  chapterId: z.string().uuid(),
  chapterNumber: z.string().max(20).nullable(),
  page: z.number().int().min(0).max(10_000),
  totalPages: z.number().int().min(0).max(10_000),
});

export function libraryRouter(library: LibraryService): Router {
  const router = Router();

  router.get("/library", requireAuth, async (req, res) => {
    const { status } = listQuery.parse(req.query);
    res.json({ entries: await library.list(currentUserId(req), status) });
  });

  router.get("/library/:mangaId", requireAuth, async (req, res) => {
    res.json({ entry: await library.get(currentUserId(req), uuidParam.parse(req.params.mangaId)) });
  });

  router.put("/library/:mangaId", requireAuth, async (req, res) => {
    const { status } = statusBody.parse(req.body);
    res.json({ entry: await library.set(currentUserId(req), uuidParam.parse(req.params.mangaId), status) });
  });

  router.delete("/library/:mangaId", requireAuth, async (req, res) => {
    await library.remove(currentUserId(req), uuidParam.parse(req.params.mangaId));
    res.status(204).end();
  });

  router.put("/progress", requireAuth, async (req, res) => {
    res.json({ progress: await library.saveProgress(currentUserId(req), progressBody.parse(req.body)) });
  });

  router.get("/progress/continue", requireAuth, async (req, res) => {
    res.json({ items: await library.continueReading(currentUserId(req)) });
  });

  router.get("/progress/:mangaId", requireAuth, async (req, res) => {
    res.json({ progress: await library.getProgress(currentUserId(req), uuidParam.parse(req.params.mangaId)) });
  });

  router.get("/history", requireAuth, async (req, res) => {
    const { page } = historyQuery.parse(req.query);
    res.json(await library.history(currentUserId(req), page));
  });

  return router;
}
```

Replace `apps/server/src/app.ts`:
```ts
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "node:path";
import type { Env } from "./config/env";
import { errorHandler, notFound } from "./lib/errors";
import { authenticate } from "./modules/auth/auth.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { CatalogService } from "./modules/catalog/catalog.service";
import { ChapterPagesService } from "./modules/catalog/chapter-pages.service";
import { DiskCache } from "./modules/images/disk-cache";
import { ImageService } from "./modules/images/image.service";
import { imagesRouter } from "./modules/images/images.routes";
import { libraryRouter } from "./modules/library/library.routes";
import { LibraryService } from "./modules/library/library.service";
import type { MangaDexApi } from "./modules/sources/mangadex/client";

export interface AppDeps {
  env: Env;
  mangadex: MangaDexApi;
  fetchImpl?: typeof fetch;
}

export function createApp({ env, mangadex, fetchImpl = fetch }: AppDeps) {
  const catalog = new CatalogService(mangadex);
  const pages = new ChapterPagesService(mangadex);
  const images = new ImageService({
    cache: new DiskCache(path.resolve(env.IMAGE_CACHE_DIR), env.IMAGE_CACHE_MAX_GB * 1024 ** 3),
    pages,
    catalog,
    fetchImpl,
    userAgent: env.APP_USER_AGENT,
    uploadsUrl: env.MANGADEX_UPLOADS_URL,
    reportUrl: env.MANGADEX_REPORT_URL,
  });
  const library = new LibraryService(catalog);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sourceAvailable: mangadex.isAvailable() });
  });
  app.use("/api/auth", authRouter(env));
  app.use("/api", catalogRouter({ env, catalog, pages }));
  app.use("/api", libraryRouter(library));
  app.use("/img", imagesRouter(images));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 6: Run all tests and typecheck**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server`
Expected: all PASS; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat(server): add library, reading progress, and history APIs"
```

---

### Task 9: Server entry point, group-removal script, docs, live smoke test

**Files:**
- Create: `apps/server/src/index.ts`, `apps/server/src/scripts/block-group.ts`, `apps/server/.env.example`, `README.md`

**Interfaces:**
- Consumes: `loadEnv`, `connectDb`, `MangaDexClient`, `createApp`, `BlockedGroup`.
- Produces: runnable `npm run dev:server`, `npm run build -w @manix/server` + `npm start -w @manix/server`, and `npm run block-group -w @manix/server -- <groupId> <reason...>`.

- [ ] **Step 1: Write the entry point**

`apps/server/src/index.ts`:
```ts
import mongoose from "mongoose";
import { createApp } from "./app";
import { loadEnv } from "./config/env";
import { connectDb } from "./db/connect";
import { MangaDexClient } from "./modules/sources/mangadex/client";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: use the real environment (e.g. in production).
}

const env = loadEnv();
await connectDb(env.MONGODB_URI);

const mangadex = new MangaDexClient({ baseUrl: env.MANGADEX_API_URL, userAgent: env.APP_USER_AGENT });
const app = createApp({ env, mangadex });

const server = app.listen(env.PORT, () => {
  console.log(`Manix server listening on http://localhost:${env.PORT}`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void mongoose.disconnect().finally(() => process.exit(0));
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
```

- [ ] **Step 2: Write the group-removal script**

`apps/server/src/scripts/block-group.ts`:
```ts
import mongoose from "mongoose";
import { loadEnv } from "../config/env";
import { connectDb } from "../db/connect";
import { BlockedGroup } from "../modules/moderation/blocked-group.model";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: use the real environment.
}

const [groupId, ...reasonWords] = process.argv.slice(2);
if (!groupId) {
  console.error("Usage: npm run block-group -w @manix/server -- <scanlationGroupId> <reason...>");
  process.exit(1);
}

const env = loadEnv();
await connectDb(env.MONGODB_URI);
await BlockedGroup.updateOne(
  { groupSourceId: groupId },
  { $set: { reason: reasonWords.join(" ") }, $setOnInsert: { requestedAt: new Date() } },
  { upsert: true },
);
console.log(`Blocked scanlation group ${groupId}. Its chapters are no longer listed or served.`);
await mongoose.disconnect();
```

- [ ] **Step 3: Write `.env.example` and README**

`apps/server/.env.example`:
```dotenv
NODE_ENV=development
PORT=4000
# Local MongoDB, or your Atlas connection string
MONGODB_URI=mongodb://127.0.0.1:27017/manix
# Generate each with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
# Must identify your site honestly (MangaDex forbids spoofed User-Agents)
APP_USER_AGENT=Manix/0.1 (+https://your-site.example/about)
IMAGE_CACHE_DIR=.cache/images
IMAGE_CACHE_MAX_GB=10
```

`README.md`:
````markdown
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

## Deployment notes

- The API trusts one proxy hop (`trust proxy = 1`) for client IPs used by rate limits. The web
  app (or load balancer) in front of it must forward `X-Forwarded-For`.
- Put a CDN in front of `/img/*`; responses are immutable for a year.
- `IMAGE_CACHE_DIR` should be on persistent disk.
````

- [ ] **Step 4: Verify tests, types, and build**

Run: `npm test -w @manix/server` then `npm run typecheck -w @manix/server` then `npm run build -w @manix/server`
Expected: all tests PASS; typecheck exits 0; `apps/server/dist/index.js` exists.

- [ ] **Step 5: Live smoke test against real MangaDex**

Requires a running MongoDB and a filled-in `apps/server/.env`. Start the server with `npm run dev:server`, then in another terminal:

```bash
curl -s http://localhost:4000/api/health
# Expected: {"ok":true,"sourceAvailable":true}

curl -s "http://localhost:4000/api/manga?q=solo%20leveling&origin=ko" | head -c 400
# Expected: JSON with "items":[...] containing manga with "coverUrl":"/img/cover/..."
```

Pick an `id` from the search output as `MANGA_ID`:
```bash
curl -s "http://localhost:4000/api/manga/MANGA_ID/chapters?lang=en" | head -c 400
# Expected: {"chapters":[...]} with group names. Pick a chapter "id" whose "externalUrl" is null as CHAPTER_ID.

curl -s "http://localhost:4000/api/chapters/CHAPTER_ID/pages"
# Expected: {"chapterId":"...","quality":"data","pages":["/img/ch/CHAPTER_ID/data/..."]}

curl -s -o /dev/null -D - "http://localhost:4000/img/ch/CHAPTER_ID/data/FIRST_FILENAME" | grep -i -E "HTTP/|x-manix-cache|content-type"
# Expected: HTTP/1.1 200, content-type image/*, x-manix-cache: MISS
# Run the same command again. Expected: x-manix-cache: HIT
```

If a chapter only lists an `externalUrl` (official publisher link), pick another title. Many licensed manhwa are external-only on MangaDex.

- [ ] **Step 6: Commit**

```bash
git add apps/server README.md
git commit -m "feat(server): add entry point, group removal script, and setup docs"
```

---

## Next

Plan 2 (`apps/web`, Next.js) is written after this plan lands. It consumes the API above through Next rewrites (`/api/*` and `/img/*` to `SERVER_API_URL`), forwards cookies and `X-Forwarded-For` on server-side fetches, and implements the pages in spec section 7, including MangaDex and group credits and the `sourceAvailable` banner.
