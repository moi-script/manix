import cookieParser from "cookie-parser";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import type { Env } from "./config/env";
import { errorHandler, HttpError, notFound } from "./lib/errors";
import { isInternalRequest } from "./lib/internal-request";
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
  app.set("trust proxy", env.TRUST_PROXY);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(authenticate(env));

  // Shared per-IP budget on top of the more specific per-route limiters, so a single
  // client can't drain the whole MangaDex request budget across many endpoints.
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => env.NODE_ENV === "test" || isInternalRequest(req, env.INTERNAL_API_TOKEN),
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many requests, slow down")),
  });
  // A chapter is ~50 images, so this comfortably covers normal reading.
  const imgLimiter = rateLimit({
    windowMs: 60_000,
    limit: 900,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: (req) => env.NODE_ENV === "test" || isInternalRequest(req, env.INTERNAL_API_TOKEN),
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many requests, slow down")),
  });
  app.use("/api", apiLimiter);
  app.use("/img", imgLimiter);

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
