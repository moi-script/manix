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
