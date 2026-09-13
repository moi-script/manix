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
