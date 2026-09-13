import type { ChapterPagesDTO, ImageQuality } from "@manix/shared";
import { HttpError } from "../../lib/errors";
import { MangaDexError, type MangaDexApi } from "../sources/mangadex/client";
import type { MdAtHomeResponse } from "../sources/mangadex/types";

/** MangaDex guarantees a baseUrl for 15 minutes; refresh well before that. */
export const AT_HOME_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 5000;

export interface AtHomeEntry {
  baseUrl: string;
  hash: string;
  data: string[];
  dataSaver: string[];
  fetchedAt: number;
}

function filesFor(entry: AtHomeEntry, quality: ImageQuality): string[] {
  return quality === "data" ? entry.data : entry.dataSaver;
}

export class ChapterPagesService {
  private readonly cache = new Map<string, AtHomeEntry>();
  /** In-flight fetches, keyed by chapter id, so concurrent callers share one request. */
  private readonly inFlight = new Map<string, Promise<AtHomeEntry>>();

  constructor(
    private readonly md: MangaDexApi,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Returns the cached at-home entry for `chapterId`, fetching (or refetching) as needed.
   *
   * `failedBaseUrl` signals that a caller just failed to fetch an image from that baseUrl:
   * - If the cached entry's baseUrl still equals `failedBaseUrl`, refetch (that node is bad).
   * - If it already differs, another caller already refreshed it, so the cached entry is
   *   returned as-is instead of triggering another refresh.
   * Without `failedBaseUrl`, normal TTL behavior applies.
   */
  async getAtHome(chapterId: string, failedBaseUrl?: string): Promise<AtHomeEntry> {
    const hit = this.cache.get(chapterId);
    const needsRefresh = failedBaseUrl !== undefined
      ? hit === undefined || hit.baseUrl === failedBaseUrl
      : hit === undefined || this.now() - hit.fetchedAt >= AT_HOME_TTL_MS;
    if (!needsRefresh) return hit as AtHomeEntry;

    const existing = this.inFlight.get(chapterId);
    if (existing) return existing;

    const fetchPromise = this.fetchAndCache(chapterId);
    this.inFlight.set(chapterId, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      this.inFlight.delete(chapterId);
    }
  }

  private async fetchAndCache(chapterId: string): Promise<AtHomeEntry> {
    let res: MdAtHomeResponse;
    try {
      res = await this.md.getAtHome<MdAtHomeResponse>(chapterId);
    } catch (err) {
      if (err instanceof MangaDexError) {
        throw new HttpError(502, "source_unavailable", "Chapter images are temporarily unavailable");
      }
      throw err;
    }

    const entry: AtHomeEntry = {
      baseUrl: res.baseUrl,
      hash: res.chapter.hash,
      data: res.chapter.data,
      dataSaver: res.chapter.dataSaver,
      fetchedAt: this.now(),
    };
    this.cache.delete(chapterId);
    this.cache.set(chapterId, entry);
    this.prune();
    return entry;
  }

  async getPages(chapterId: string, quality: ImageQuality): Promise<ChapterPagesDTO> {
    const entry = await this.getAtHome(chapterId);
    return {
      chapterId,
      quality,
      pages: filesFor(entry, quality).map((file) => `/img/ch/${chapterId}/${quality}/${encodeURIComponent(file)}`),
    };
  }

  hasFile(entry: AtHomeEntry, quality: ImageQuality, filename: string): boolean {
    return filesFor(entry, quality).includes(filename);
  }

  private prune(): void {
    for (const [key, value] of this.cache) {
      if (this.now() - value.fetchedAt >= AT_HOME_TTL_MS) this.cache.delete(key);
    }
    while (this.cache.size > MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
