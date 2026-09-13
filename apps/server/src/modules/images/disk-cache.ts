import crypto from "node:crypto";
import { createWriteStream, type WriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export interface CacheHit {
  path: string;
  size: number;
}

export interface CacheWriter {
  stream: WriteStream;
  commit(): Promise<void>;
  abort(): Promise<void>;
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

/** Content-addressed file cache. File mtime doubles as last-access time for LRU eviction. */
export class DiskCache {
  private evicting = false;
  private lastEvict = Date.now();

  constructor(
    private readonly dir: string,
    private readonly maxBytes: number,
    private readonly autoEvictIntervalMs = 5 * 60 * 1000,
  ) {}

  pathFor(key: string): string {
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    return path.join(this.dir, hash.slice(0, 2), hash);
  }

  async get(key: string): Promise<CacheHit | null> {
    const file = this.pathFor(key);
    try {
      const stat = await fs.stat(file);
      const now = new Date();
      void fs.utimes(file, now, now).catch(() => undefined);
      return { path: file, size: stat.size };
    } catch {
      return null;
    }
  }

  async createWriter(key: string): Promise<CacheWriter> {
    const file = this.pathFor(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${crypto.randomUUID()}.tmp`;
    const stream = createWriteStream(tmp);

    return {
      stream,
      commit: async () => {
        try {
          await fs.rename(tmp, file);
        } catch (err) {
          // Another request may have cached the same image first (rename fails on Windows).
          await fs.rm(tmp, { force: true });
          if (!(await exists(file))) throw err;
        }
        this.maybeEvict();
      },
      abort: async () => {
        await new Promise<void>((resolve) => {
          if (stream.closed) return resolve();
          stream.once("close", () => resolve());
          stream.destroy();
        });
        await fs.rm(tmp, { force: true });
      },
    };
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const writer = await this.createWriter(key);
    await new Promise<void>((resolve, reject) => {
      writer.stream.once("error", reject);
      writer.stream.end(data, () => resolve());
    });
    await writer.commit();
  }

  async evict(): Promise<void> {
    const files: { file: string; size: number; mtimeMs: number }[] = [];
    const buckets = await fs.readdir(this.dir).catch(() => [] as string[]);
    for (const bucket of buckets) {
      const bucketDir = path.join(this.dir, bucket);
      const names = await fs.readdir(bucketDir).catch(() => [] as string[]);
      for (const name of names) {
        if (name.endsWith(".tmp")) continue;
        const file = path.join(bucketDir, name);
        const stat = await fs.stat(file).catch(() => null);
        if (stat?.isFile()) files.push({ file, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }

    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= this.maxBytes) return;

    const target = this.maxBytes * 0.9;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of files) {
      if (total <= target) break;
      await fs.rm(f.file, { force: true });
      total -= f.size;
    }
  }

  private maybeEvict(): void {
    if (this.evicting || Date.now() - this.lastEvict < this.autoEvictIntervalMs) return;
    this.evicting = true;
    this.lastEvict = Date.now();
    void this.evict()
      .catch((err) => console.error("Image cache eviction failed", err))
      .finally(() => {
        this.evicting = false;
      });
  }
}
