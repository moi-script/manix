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
