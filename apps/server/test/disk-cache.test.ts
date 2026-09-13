import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DiskCache } from "../src/modules/images/disk-cache";

describe("DiskCache", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "manix-cache-"));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("stores entries and reads them back", async () => {
    const cache = new DiskCache(dir, 1024);
    await cache.put("ch/a/data/1.png", Buffer.from("hello"));
    const hit = await cache.get("ch/a/data/1.png");
    expect(hit?.size).toBe(5);
    expect(await fs.readFile(hit!.path, "utf8")).toBe("hello");
  });

  it("returns null on a miss", async () => {
    expect(await new DiskCache(dir, 1024).get("missing")).toBeNull();
  });

  it("leaves no entry and no temp file when a write is aborted", async () => {
    const cache = new DiskCache(dir, 1024);
    const writer = await cache.createWriter("partial");
    writer.stream.write("half an image");
    await writer.abort();
    expect(await cache.get("partial")).toBeNull();
    expect(await fs.readdir(path.dirname(cache.pathFor("partial")))).toEqual([]);
  });

  it("evicts least recently used files once over the size cap", async () => {
    const cache = new DiskCache(dir, 250);
    await cache.put("old", Buffer.alloc(100));
    await cache.put("mid", Buffer.alloc(100));
    await cache.put("new", Buffer.alloc(100));
    const t = Date.now() / 1000;
    await fs.utimes(cache.pathFor("old"), t - 300, t - 300);
    await fs.utimes(cache.pathFor("mid"), t - 200, t - 200);
    await fs.utimes(cache.pathFor("new"), t - 100, t - 100);

    await cache.evict();

    expect(await cache.get("old")).toBeNull();
    expect(await cache.get("mid")).not.toBeNull();
    expect(await cache.get("new")).not.toBeNull();
  });
});
