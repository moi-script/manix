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
