import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { DiskCache } from "../src/modules/images/disk-cache";
import { ImageService } from "../src/modules/images/image.service";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { testEnv } from "./helpers/env";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import { atHome, CH1, COVER_FILE, GROUP_A, MANGA_ID, standardHandlers } from "./helpers/fixtures";

const NODE1 = "https://node1.example-mdah.net:443/token123";
const NODE2 = "https://node2.example-mdah.net:443/token456";
const HASH = "3303dd03ac8d27452cce3f2a882e94b2";
const REPORT_URL = "https://report.mangadex.test/report";
const COVER_UPSTREAM = `https://uploads.mangadex.test/covers/${MANGA_ID}/${COVER_FILE}.512.jpg`;
const PNG = new Uint8Array(Buffer.from("fake-png-bytes-for-page-one"));
const PAGE_URL = `/img/ch/${CH1}/data/1-aaa.png`;

function getBinary(app: TestApp, url: string) {
  return request(app)
    .get(url)
    .buffer(true)
    .parse((res, callback) => {
      const stream = res as unknown as NodeJS.ReadableStream;
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => callback(null, Buffer.concat(chunks)));
    });
}

describe("image proxy", () => {
  let dir: string;
  let fake: FakeMangaDex;
  let fetchImpl: Mock;
  let app: TestApp;

  const callsTo = (url: string) => fetchImpl.mock.calls.filter(([u]) => String(u) === url);

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Chapter.init(), BlockedGroup.init()]);
  });

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "manix-img-"));
    fake = fakeMangaDex(standardHandlers(), { [CH1]: atHome() });
    fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === `${NODE1}/data/${HASH}/1-aaa.png`) {
        return new Response(PNG, { status: 200, headers: { "content-type": "image/png", "x-cache": "MISS" } });
      }
      if (url === REPORT_URL) return new Response(null, { status: 200 });
      if (url === COVER_UPSTREAM) return new Response(new Uint8Array(Buffer.from("cover")), { status: 200 });
      return new Response("not found", { status: 404 });
    });
    app = buildTestApp({
      env: testEnv({ IMAGE_CACHE_DIR: dir }),
      mangadex: fake.api,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  });

  afterEach(async () => {
    await clearTestDb();
    await fs.rm(dir, { recursive: true, force: true });
  });
  afterAll(stopTestDb);

  it("proxies a chapter page, caches it on disk, and reports to the @Home network", async () => {
    const first = await getBinary(app, PAGE_URL);
    expect(first.status).toBe(200);
    expect(first.headers["content-type"]).toBe("image/png");
    expect(first.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(first.headers["x-manix-cache"]).toBe("MISS");
    expect(Buffer.compare(first.body as Buffer, Buffer.from(PNG))).toBe(0);

    const [nodeCall] = callsTo(`${NODE1}/data/${HASH}/1-aaa.png`);
    const headers = (nodeCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("Manix-Test/0.0");
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Cookie).toBeUndefined();

    await vi.waitFor(() => expect(callsTo(REPORT_URL)).toHaveLength(1));
    const report = JSON.parse(String((callsTo(REPORT_URL)[0][1] as RequestInit).body));
    expect(report).toMatchObject({
      url: `${NODE1}/data/${HASH}/1-aaa.png`,
      success: true,
      bytes: PNG.length,
      cached: false,
    });

    const cachePath = new DiskCache(dir, 1).pathFor(`ch/${CH1}/data/1-aaa.png`);
    await vi.waitFor(() => fs.access(cachePath));

    const second = await getBinary(app, PAGE_URL);
    expect(second.status).toBe(200);
    expect(second.headers["x-manix-cache"]).toBe("HIT");
    expect(Buffer.compare(second.body as Buffer, Buffer.from(PNG))).toBe(0);
    expect(callsTo(`${NODE1}/data/${HASH}/1-aaa.png`)).toHaveLength(1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);
  });

  it("refreshes the at-home server once when a node rejects the request", async () => {
    fake.getAtHome.mockResolvedValueOnce(atHome()).mockResolvedValueOnce({ ...atHome(), baseUrl: NODE2 });
    fetchImpl.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.startsWith(NODE1)) return new Response(null, { status: 403 });
      if (url === `${NODE2}/data/${HASH}/1-aaa.png`) return new Response(PNG, { status: 200 });
      return new Response(null, { status: 200 });
    });

    const res = await getBinary(app, PAGE_URL);
    expect(res.status).toBe(200);
    expect(fake.getAtHome).toHaveBeenCalledTimes(2);
  });

  it("returns 502 when the node keeps failing", async () => {
    fetchImpl.mockImplementation(async () => new Response(null, { status: 500 }));
    const res = await request(app).get(PAGE_URL);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("image_unavailable");
  });

  it("returns 404 for files that are not part of the chapter", async () => {
    const res = await request(app).get(`/img/ch/${CH1}/data/9-zzz.png`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("image_not_found");
  });

  it("rejects unsafe filenames", async () => {
    const res = await request(app).get(`/img/ch/${CH1}/data/..%2F..%2Fsecret`);
    expect(res.status).toBe(400);
  });

  it("refuses images from blocked groups without touching the node", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_A, name: "Alpha Scans", reason: "removal request" });
    const res = await request(app).get(PAGE_URL);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
    expect(callsTo(`${NODE1}/data/${HASH}/1-aaa.png`)).toHaveLength(0);
  });

  // A real end-to-end "client disconnects mid-download" reproduction (real TCP socket
  // via app.listen(0), req.destroy() on first byte) was attempted here first, but proved
  // non-deterministic on Windows: `req.destroy()` did not reliably surface as a write
  // error on the Express `res` before the upstream stream finished, so the assertion
  // passed the same whether or not the fix in image.service.ts was present. Per the
  // fallback guidance, this is a focused unit test instead: it drives `ImageService`
  // directly with a fake `res` (a real Writable) and forces an 'error' event on it
  // mid-stream, deterministically reproducing what a client disconnect looks like from
  // the service's point of view.
  it("does not crash when the response stream errors mid-download (client disconnect)", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const slowBody = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        c.enqueue(PNG.slice(0, 4));
      },
    });
    const upstreamFetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === `${NODE1}/data/${HASH}/1-aaa.png`) {
        return new Response(slowBody, { status: 200, headers: { "content-type": "image/png" } });
      }
      return new Response(null, { status: 200 });
    });

    const cache = new DiskCache(dir, 1024 * 1024);
    const images = new ImageService({
      cache,
      pages: {
        getAtHome: async () => ({ baseUrl: NODE1, hash: HASH, data: ["1-aaa.png"], dataSaver: [], fetchedAt: Date.now() }),
        hasFile: () => true,
      },
      catalog: { assertReadable: async () => undefined },
      fetchImpl: upstreamFetch as unknown as typeof fetch,
      userAgent: "Manix-Test/0.0",
      uploadsUrl: "https://uploads.mangadex.test",
      reportUrl: REPORT_URL,
    });

    const res = new PassThrough() as PassThrough & { setHeader: (name: string, value: string) => void };
    res.setHeader = () => undefined; // minimal Express Response duck-typing

    let uncaught: unknown;
    const onUncaught = (err: unknown) => {
      uncaught = err;
    };
    process.once("uncaughtException", onUncaught);

    const served = images.serveChapterImage(
      res as unknown as import("express").Response,
      CH1,
      "data",
      "1-aaa.png",
    );

    // Wait until the service has actually attached its stream listeners (real fs work
    // in DiskCache.createWriter happens first) before simulating the client going away,
    // so this doesn't race the service's own setup.
    await vi.waitFor(() => {
      if (res.listenerCount("close") === 0) throw new Error("not wired up yet");
    });
    res.destroy(new Error("simulated client disconnect"));

    // Finish the upstream body; the cache write must still complete even though the
    // client-facing stream errored out.
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.enqueue(PNG.slice(4));
    controller.close();

    await served.catch(() => undefined);
    await new Promise((resolve) => setImmediate(resolve));
    process.removeListener("uncaughtException", onUncaught);

    expect(uncaught).toBeUndefined();
    const hit = await cache.get(`ch/${CH1}/data/1-aaa.png`);
    expect(hit).not.toBeNull();
  });

  it("proxies covers from the uploads server without reporting", async () => {
    const res = await getBinary(app, `/img/cover/${MANGA_ID}/${COVER_FILE}.512.jpg`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect((res.body as Buffer).toString()).toBe("cover");
    expect(callsTo(REPORT_URL)).toHaveLength(0);
  });
});
