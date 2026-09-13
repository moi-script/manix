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
