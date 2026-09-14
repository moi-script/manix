import type { ChapterDetailDTO, ChapterDTO, MangaDTO, Paginated } from "@manix/shared";
import { HttpError } from "../../lib/errors";
import type { AniListApi } from "../sources/anilist/client";
import { BlockedGroup } from "../moderation/blocked-group.model";
import { MangaDexError, type MangaDexApi } from "../sources/mangadex/client";
import { mapChapter, mapManga, type ChapterRecord, type MangaRecord } from "../sources/mangadex/mappers";
import type { MdChapter, MdCollectionResponse, MdEntityResponse, MdManga } from "../sources/mangadex/types";
import type { SearchParams } from "./catalog.schemas";
import { Chapter, FeedCache, type ChapterCache, type FeedCacheAttrs } from "./chapter.model";
import { toChapterDTO, toMangaDTO } from "./dto";
import { Manga, type AniListEnrichment, type MangaCache } from "./manga.model";

export const MANGA_TTL_MS = 6 * 60 * 60 * 1000;
export const CHAPTER_TTL_MS = 60 * 60 * 1000;
/** Official links rarely change, and AniList allows ~90 requests a minute. */
export const ANILIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SEARCH_PAGE_SIZE = 24;
/** How long a 404/400 from MangaDex for an id is remembered before retrying upstream. */
export const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_NEGATIVE_ENTRIES = 10_000;
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

function rankReadableFirst(manga: MdManga[], language: string): MdManga[] {
  const tier = (m: MdManga) =>
    (m.attributes.availableTranslatedLanguages ?? []).includes(language) ? 0 : m.attributes.links?.engtl ? 1 : 2;
  return manga
    .map((m, index) => ({ m, index, tier: tier(m) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(({ m }) => m);
}

export class CatalogService {
  /** Manga/chapter ids MangaDex recently returned 404/400 for, mapped to their expiry. */
  private readonly mangaMisses = new Map<string, number>();
  private readonly chapterMisses = new Map<string, number>();

  constructor(
    private readonly md: MangaDexApi,
    private readonly now: () => number = () => Date.now(),
    private readonly anilist: AniListApi | null = null,
  ) {}

  async getManga(id: string): Promise<MangaDTO> {
    const cached = (await Manga.findOne({ source: "mangadex", sourceId: id }).lean()) as MangaCache | null;
    if (cached && this.isFresh(cached.cachedAt, MANGA_TTL_MS)) return toMangaDTO(await this.withAniList(cached));
    if (!cached && this.isNegativelyCached(this.mangaMisses, id)) throw mangaNotFound();

    let record: MangaRecord;
    try {
      const res = await this.md.get<MdEntityResponse<MdManga>>(`/manga/${id}`, { includes: MANGA_INCLUDES });
      record = mapManga(res.data);
      await this.cacheManga([record]);
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      if (cached) return toMangaDTO(cached);
      if (err.status === 404 || err.status === 400) {
        this.recordMiss(this.mangaMisses, id);
        throw mangaNotFound();
      }
      throw sourceUnavailable();
    }
    return toMangaDTO(
      await this.withAniList({ ...record, anilistLinks: cached?.anilistLinks, anilistCheckedAt: cached?.anilistCheckedAt }),
    );
  }

  /** Adds AniList's official English links when they are missing or stale. Never throws. */
  private async withAniList<T extends MangaRecord & AniListEnrichment>(manga: T): Promise<T> {
    if (!this.anilist || manga.anilistId === null || manga.anilistId === undefined) return manga;
    if (manga.anilistCheckedAt && this.isFresh(manga.anilistCheckedAt, ANILIST_TTL_MS)) return manga;
    try {
      const anilistLinks = await this.anilist.englishLinks(manga.anilistId);
      const anilistCheckedAt = new Date(this.now());
      await Manga.updateOne(
        { source: manga.source, sourceId: manga.sourceId },
        { $set: { anilistLinks, anilistCheckedAt } },
      );
      return { ...manga, anilistLinks, anilistCheckedAt };
    } catch {
      // Leave anilistCheckedAt alone so the next title view tries again.
      return manga;
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
        // Browsing lists only titles readable here; a title search also finds licensed series,
        // whose pages point to the official English release instead.
        availableTranslatedLanguage: params.q ? undefined : [params.lang],
        hasAvailableChapters: params.q ? undefined : "true",
        [`order[${order}]`]: "desc",
      });
      // A title search no longer filters by language, so rank titles readable here first, then ones
      // with an official English release, then novel editions and placeholders, keeping MangaDex's
      // relevance order within each tier.
      const ranked = params.q ? rankReadableFirst(res.data, params.lang) : res.data;
      const records = ranked.map(mapManga);
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
      })) as Parameters<typeof Manga.bulkWrite>[0],
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
    if (!feed && this.isNegativelyCached(this.mangaMisses, mangaId)) throw mangaNotFound();

    let records: ChapterRecord[];
    try {
      records = await this.fetchFeed(mangaId, language);
    } catch (err) {
      if (!(err instanceof MangaDexError)) throw err;
      if (feed) return;
      if (err.status === 404 || err.status === 400) {
        this.recordMiss(this.mangaMisses, mangaId);
        throw mangaNotFound();
      }
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
        })) as Parameters<typeof Chapter.bulkWrite>[0],
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
    if (!cached && this.isNegativelyCached(this.chapterMisses, id)) throw chapterNotFound();

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
      if (err.status === 404 || err.status === 400) {
        this.recordMiss(this.chapterMisses, id);
        throw chapterNotFound();
      }
      throw sourceUnavailable();
    }
  }

  /** Whether `id` is in `map` and its negative-cache entry has not expired. Prunes expired entries. */
  private isNegativelyCached(map: Map<string, number>, id: string): boolean {
    const expiresAt = map.get(id);
    if (expiresAt === undefined) return false;
    if (this.now() >= expiresAt) {
      map.delete(id);
      return false;
    }
    return true;
  }

  private recordMiss(map: Map<string, number>, id: string): void {
    map.delete(id);
    map.set(id, this.now() + NEGATIVE_CACHE_TTL_MS);
    while (map.size > MAX_NEGATIVE_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
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
