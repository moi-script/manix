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
