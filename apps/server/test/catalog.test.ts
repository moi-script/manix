import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { CatalogService, findNeighbors, NEGATIVE_CACHE_TTL_MS } from "../src/modules/catalog/catalog.service";
import { Manga } from "../src/modules/catalog/manga.model";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { MangaDexError, type Query } from "../src/modules/sources/mangadex/client";
import { mapChapter } from "../src/modules/sources/mangadex/mappers";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import {
  CH1,
  CH2A,
  CH2B,
  CH3,
  chapterFeed,
  COVER_FILE,
  GROUP_A,
  GROUP_B,
  MANGA_ID,
  mangaEntity,
  standardHandlers,
} from "./helpers/fixtures";

describe("catalog", () => {
  let fake: FakeMangaDex;
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Manga.init(), Chapter.init(), BlockedGroup.init()]);
  });
  beforeEach(() => {
    fake = fakeMangaDex(standardHandlers());
    app = buildTestApp({ mangadex: fake.api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("reports source availability on the health endpoint", async () => {
    fake.isAvailable.mockReturnValue(false);
    const res = await request(app).get("/api/health");
    expect(res.body).toEqual({ ok: true, sourceAvailable: false });
  });

  it("fetches manga details once and then serves them from cache", async () => {
    const first = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(first.status).toBe(200);
    expect(first.body.manga).toMatchObject({
      id: MANGA_ID,
      source: "mangadex",
      title: "Solo Leveling",
      coverUrl: `/img/cover/${MANGA_ID}/${COVER_FILE}.512.jpg`,
    });
    expect(fake.get.mock.calls[0][1]).toMatchObject({ includes: ["cover_art", "author", "artist"] });

    const second = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(second.body.manga.title).toBe("Solo Leveling");
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("serves stale cached manga when MangaDex fails", async () => {
    await request(app).get(`/api/manga/${MANGA_ID}`);
    await Manga.updateOne({ sourceId: MANGA_ID }, { $set: { cachedAt: new Date(0) } });
    fake.handlers[`/manga/${MANGA_ID}`] = new MangaDexError(503, "down");

    const res = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.manga.title).toBe("Solo Leveling");
    expect(fake.get).toHaveBeenCalledTimes(2);
  });

  it("returns 404 for unknown manga and 400 for malformed ids", async () => {
    const unknown = await request(app).get("/api/manga/11111111-1111-4111-8111-111111111111");
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("manga_not_found");

    const malformed = await request(app).get("/api/manga/not-a-uuid");
    expect(malformed.status).toBe(400);
  });

  it("returns 502 when MangaDex is down and nothing is cached", async () => {
    fake.handlers[`/manga/${MANGA_ID}`] = new MangaDexError(503, "down");
    const res = await request(app).get(`/api/manga/${MANGA_ID}`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("source_unavailable");
  });

  it("searches MangaDex with filters and caches the results", async () => {
    fake.handlers["/manga"] = (query: Query) => ({
      result: "ok",
      data: [mangaEntity().data],
      limit: 24,
      offset: query.offset,
      total: 1,
    });

    const res = await request(app).get("/api/manga?q=solo&origin=ko&status=completed&page=1");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 24 });
    expect(res.body.items[0].id).toBe(MANGA_ID);
    expect(fake.get.mock.calls[0][0]).toBe("/manga");
    expect(fake.get.mock.calls[0][1]).toMatchObject({
      title: "solo",
      offset: 0,
      limit: 24,
      originalLanguage: ["ko"],
      status: ["completed"],
      contentRating: ["safe", "suggestive"],
      availableTranslatedLanguage: ["en"],
      "order[relevance]": "desc",
    });
    expect(await Manga.countDocuments({ sourceId: MANGA_ID })).toBe(1);
  });

  it("orders by follows when there is no search text", async () => {
    fake.handlers["/manga"] = { result: "ok", data: [], limit: 24, offset: 0, total: 0 };
    await request(app).get("/api/manga");
    expect(fake.get.mock.calls[0][1]).toMatchObject({ "order[followedCount]": "desc" });
  });

  it("falls back to cached manga when search fails", async () => {
    await request(app).get(`/api/manga/${MANGA_ID}`);
    fake.handlers["/manga"] = new MangaDexError(503, "down");

    const res = await request(app).get("/api/manga?origin=ko");
    expect(res.status).toBe(200);
    expect(res.body.items.map((m: { id: string }) => m.id)).toEqual([MANGA_ID]);
  });

  it("rejects pages beyond the MangaDex result window", async () => {
    const res = await request(app).get("/api/manga?page=500");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("page_out_of_range");
  });

  it("lists chapters sorted, cached, and without blocked groups", async () => {
    const res = await request(app).get(`/api/manga/${MANGA_ID}/chapters?lang=en`);
    expect(res.status).toBe(200);
    expect(res.body.chapters.map((c: { id: string }) => c.id)).toEqual([CH1, CH2A, CH2B, CH3]);
    expect(res.body.chapters[0].groups).toEqual([{ id: GROUP_A, name: "Alpha Scans" }]);

    await BlockedGroup.create({ groupSourceId: GROUP_B, name: "Beta Group", reason: "removal request" });
    const again = await request(app).get(`/api/manga/${MANGA_ID}/chapters?lang=en`);
    expect(again.body.chapters.map((c: { id: string }) => c.id)).toEqual([CH1, CH2A, CH3]);
    expect(fake.get).toHaveBeenCalledTimes(1);
  });

  it("returns chapter details with prev/next that prefer the same group", async () => {
    const ch1 = await request(app).get(`/api/chapters/${CH1}`);
    expect(ch1.status).toBe(200);
    expect(ch1.body.chapter).toMatchObject({ id: CH1, mangaId: MANGA_ID, prevChapterId: null, nextChapterId: CH2A });

    const ch2b = await request(app).get(`/api/chapters/${CH2B}`);
    expect(ch2b.body.chapter).toMatchObject({ prevChapterId: CH1, nextChapterId: CH3 });

    const ch3 = await request(app).get(`/api/chapters/${CH3}`);
    expect(ch3.body.chapter).toMatchObject({ prevChapterId: CH2A, nextChapterId: null });
  });

  it("hides chapters from blocked groups", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_B, name: "Beta Group", reason: "removal request" });
    const res = await request(app).get(`/api/chapters/${CH2B}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
  });

  it("negatively caches an unknown manga id so a second lookup skips MangaDex, and expires after 10 minutes", async () => {
    const unknownId = "11111111-1111-4111-8111-111111111111";
    let now = 0;
    const service = new CatalogService(fake.api, () => now);

    await expect(service.getManga(unknownId)).rejects.toMatchObject({ code: "manga_not_found" });
    expect(fake.get).toHaveBeenCalledTimes(1);

    await expect(service.getManga(unknownId)).rejects.toMatchObject({ code: "manga_not_found" });
    expect(fake.get).toHaveBeenCalledTimes(1);

    now = NEGATIVE_CACHE_TTL_MS + 1;
    await expect(service.getManga(unknownId)).rejects.toMatchObject({ code: "manga_not_found" });
    expect(fake.get).toHaveBeenCalledTimes(2);
  });
});

describe("findNeighbors", () => {
  it("skips external chapters", () => {
    const sorted = chapterFeed()
      .data.map(mapChapter)
      .sort((a, b) => a.sortKey - b.sortKey || a.publishedAt.getTime() - b.publishedAt.getTime());
    const current = sorted.find((c) => c.sourceId === CH1)!;
    for (const c of sorted) if (c.sortKey === 2) c.externalUrl = "https://official.example/ch2";
    expect(findNeighbors(sorted, current)).toEqual({ prev: null, next: CH3 });
  });
});
