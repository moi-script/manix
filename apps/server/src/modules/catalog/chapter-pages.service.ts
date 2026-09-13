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

  constructor(
    private readonly md: MangaDexApi,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async getAtHome(chapterId: string, forceRefresh = false): Promise<AtHomeEntry> {
    const hit = this.cache.get(chapterId);
    if (hit && !forceRefresh && this.now() - hit.fetchedAt < AT_HOME_TTL_MS) return hit;

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
