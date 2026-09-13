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
