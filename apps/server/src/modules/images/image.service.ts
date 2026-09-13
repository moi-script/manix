import type { ImageQuality } from "@manix/shared";
import type { Response as ExpressResponse } from "express";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { HttpError } from "../../lib/errors";
import type { CatalogService } from "../catalog/catalog.service";
import type { AtHomeEntry, ChapterPagesService } from "../catalog/chapter-pages.service";
import type { DiskCache } from "./disk-cache";

const IMMUTABLE = "public, max-age=31536000, immutable";
// Chapter pages must never be cached at a shared/CDN layer for as long as covers: if a
// scanlation group gets blocked, its chapter images must stop being served promptly.
const CHAPTER_PAGE_CACHE_CONTROL = "public, max-age=86400, s-maxage=3600";
const UPSTREAM_TIMEOUT_MS = 20_000;
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const SAFE_FILENAME = /^[A-Za-z0-9._-]{1,200}$/;
export const COVER_FILENAME = /^[A-Za-z0-9-]{1,100}\.(jpg|jpeg|png|webp)(\.(256|512)\.jpg)?$/;

export function contentTypeFor(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export interface ImageServiceOptions {
  cache: DiskCache;
  pages: Pick<ChapterPagesService, "getAtHome" | "hasFile">;
  catalog: Pick<CatalogService, "assertReadable">;
  fetchImpl: typeof fetch;
  userAgent: string;
  uploadsUrl: string;
  reportUrl: string;
  now?: () => number;
}

interface UpstreamAttempt {
  url: string;
  startedAt: number;
  response: Response;
}

function nodeUrl(entry: AtHomeEntry, quality: ImageQuality, filename: string): string {
  return `${entry.baseUrl}/${quality}/${entry.hash}/${filename}`;
}

function cacheControlFor(key: string): string {
  return key.startsWith("ch/") ? CHAPTER_PAGE_CACHE_CONTROL : IMMUTABLE;
}

export class ImageService {
  private readonly now: () => number;

  constructor(private readonly o: ImageServiceOptions) {
    this.now = o.now ?? (() => Date.now());
  }

  async serveChapterImage(
    res: ExpressResponse,
    chapterId: string,
    quality: ImageQuality,
    filename: string,
  ): Promise<void> {
    await this.o.catalog.assertReadable(chapterId);
    const key = `ch/${chapterId}/${quality}/${filename}`;
    if (await this.sendCached(res, key, filename)) return;

    let entry = await this.o.pages.getAtHome(chapterId);
    if (!this.o.pages.hasFile(entry, quality, filename)) {
      throw new HttpError(404, "image_not_found", "Image not found");
    }

    let attempt = await this.fetchUpstream(nodeUrl(entry, quality, filename));
    if (!attempt.response.ok) {
      this.report(attempt, false, 0, false);
      // Only a rejected (403) or unreachable (synthetic 599) node justifies asking MangaDex
      // for a fresh one; any other non-OK status is treated as a hard failure so that a pile
      // of concurrently failing requests for the same node doesn't each force their own
      // at-home refresh.
      if (attempt.response.status === 403 || attempt.response.status === 599) {
        entry = await this.o.pages.getAtHome(chapterId, entry.baseUrl);
        attempt = await this.fetchUpstream(nodeUrl(entry, quality, filename));
      }
    }
    if (!attempt.response.ok || !attempt.response.body) {
      this.report(attempt, false, 0, false);
      throw new HttpError(502, "image_unavailable", "Image source is unavailable");
    }

    const nodeCached = attempt.response.headers.get("x-cache")?.startsWith("HIT") ?? false;
    try {
      const bytes = await this.streamAndCache(res, attempt.response, key, filename);
      this.report(attempt, true, bytes, nodeCached);
    } catch (err) {
      this.report(attempt, false, 0, nodeCached);
      throw err;
    }
  }

  async serveCover(res: ExpressResponse, mangaId: string, filename: string): Promise<void> {
    const key = `cover/${mangaId}/${filename}`;
    if (await this.sendCached(res, key, filename)) return;

    const { response } = await this.fetchUpstream(`${this.o.uploadsUrl}/covers/${mangaId}/${filename}`);
    if (response.status === 404) throw new HttpError(404, "image_not_found", "Image not found");
    if (!response.ok || !response.body) throw new HttpError(502, "image_unavailable", "Image source is unavailable");
    await this.streamAndCache(res, response, key, filename);
  }

  private async sendCached(res: ExpressResponse, key: string, filename: string): Promise<boolean> {
    const hit = await this.o.cache.get(key);
    if (!hit) return false;
    res.setHeader("Cache-Control", cacheControlFor(key));
    res.setHeader("Content-Type", contentTypeFor(filename));
    res.setHeader("Content-Length", String(hit.size));
    res.setHeader("X-Manix-Cache", "HIT");
    await pipeline(createReadStream(hit.path), res);
    return true;
  }

  private async fetchUpstream(url: string): Promise<UpstreamAttempt> {
    const startedAt = this.now();
    try {
      // No Authorization or Cookie headers are ever sent to image servers.
      const response = await this.o.fetchImpl(url, {
        headers: { "User-Agent": this.o.userAgent },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      return { url, startedAt, response };
    } catch {
      return { url, startedAt, response: new Response(null, { status: 599 }) };
    }
  }

  private async streamAndCache(
    res: ExpressResponse,
    upstream: Response,
    key: string,
    filename: string,
  ): Promise<number> {
    const lengthHeader = upstream.headers.get("content-length");
    const expected = lengthHeader && !upstream.headers.get("content-encoding") ? Number(lengthHeader) : Number.NaN;

    res.setHeader("Cache-Control", cacheControlFor(key));
    res.setHeader("Content-Type", contentTypeFor(filename));
    res.setHeader("X-Manix-Cache", "MISS");
    if (Number.isFinite(expected)) res.setHeader("Content-Length", String(expected));

    const source = Readable.fromWeb(upstream.body as unknown as NodeWebReadableStream<Uint8Array>);
    const writer = await this.o.cache.createWriter(key);
    let bytes = 0;
    source.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
    });
    // A client disconnect must not crash the process, and must not abort the cache
    // write. Writing to a destroyed response can emit 'error' with no listener, which
    // is fatal by default, so swallow it. That alone is not enough, though: once `res`
    // is destroyed every further write to it returns false (backpressure) and it will
    // never emit 'drain', so pipe()'s flow control would otherwise pause `source`
    // forever and stall the parallel write into `writer.stream` too. Unpipe `res` on
    // close (and resume `source`, since unpiping alone leaves it paused) so the cache
    // write keeps flowing and still gets committed once the upstream finishes,
    // independent of whether the client is still there.
    res.on("error", () => undefined);
    res.once("close", () => {
      source.unpipe(res);
      source.resume();
    });
    source.pipe(res);

    try {
      await pipeline(source, writer.stream);
      if (Number.isFinite(expected) && bytes !== expected) {
        throw new Error(`Truncated upstream image: ${bytes}/${expected} bytes`);
      }
      await writer.commit();
      return bytes;
    } catch (err) {
      await writer.abort();
      res.destroy();
      throw err;
    }
  }

  /** MangaDex@Home asks clients to report fetches from non-mangadex.org nodes. */
  private report(attempt: UpstreamAttempt, success: boolean, bytes: number, cached: boolean): void {
    const hostname = new URL(attempt.url).hostname;
    if (hostname === "mangadex.org" || hostname.endsWith(".mangadex.org")) return;
    const body = JSON.stringify({
      url: attempt.url,
      success,
      bytes,
      duration: this.now() - attempt.startedAt,
      cached,
    });
    void Promise.resolve()
      .then(() =>
        this.o.fetchImpl(this.o.reportUrl, {
          method: "POST",
          headers: { "User-Agent": this.o.userAgent, "Content-Type": "application/json" },
          body,
        }),
      )
      .catch(() => undefined);
  }
}
