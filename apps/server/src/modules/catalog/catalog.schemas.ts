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
