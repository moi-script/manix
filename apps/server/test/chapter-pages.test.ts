import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chapter } from "../src/modules/catalog/chapter.model";
import { AT_HOME_TTL_MS, ChapterPagesService } from "../src/modules/catalog/chapter-pages.service";
import { BlockedGroup } from "../src/modules/moderation/blocked-group.model";
import { MangaDexError } from "../src/modules/sources/mangadex/client";
import { buildTestApp, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex, type FakeMangaDex } from "./helpers/fake-mangadex";
import { atHome, CH1, GROUP_A, standardHandlers } from "./helpers/fixtures";

describe("GET /api/chapters/:id/pages", () => {
  let fake: FakeMangaDex;
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([Chapter.init(), BlockedGroup.init()]);
  });
  beforeEach(() => {
    fake = fakeMangaDex(standardHandlers(), { [CH1]: atHome() });
    app = buildTestApp({ mangadex: fake.api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("returns Manix image URLs and never exposes the MangaDex node", async () => {
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      chapterId: CH1,
      quality: "data",
      pages: [`/img/ch/${CH1}/data/1-aaa.png`, `/img/ch/${CH1}/data/2-bbb.png`],
    });
    expect(JSON.stringify(res.body)).not.toContain("example-mdah.net");
  });

  it("supports data-saver quality", async () => {
    const res = await request(app).get(`/api/chapters/${CH1}/pages?quality=data-saver`);
    expect(res.body.pages).toEqual([`/img/ch/${CH1}/data-saver/1-aaa.jpg`, `/img/ch/${CH1}/data-saver/2-bbb.jpg`]);
  });

  it("caches the at-home response between requests", async () => {
    await request(app).get(`/api/chapters/${CH1}/pages`);
    await request(app).get(`/api/chapters/${CH1}/pages?quality=data-saver`);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);
  });

  it("refuses blocked chapters without calling at-home", async () => {
    await BlockedGroup.create({ groupSourceId: GROUP_A, name: "Alpha Scans", reason: "removal request" });
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("chapter_unavailable");
    expect(fake.getAtHome).not.toHaveBeenCalled();
  });

  it("returns 502 when at-home fails", async () => {
    fake.atHomeResponses[CH1] = new MangaDexError(503, "down");
    const res = await request(app).get(`/api/chapters/${CH1}/pages`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("source_unavailable");
  });
});

describe("ChapterPagesService", () => {
  it("refetches when the failed baseUrl matches, not when it already changed, and after the TTL", async () => {
    let now = 0;
    const fake = fakeMangaDex({}, { [CH1]: atHome() });
    fake.getAtHome
      .mockResolvedValueOnce(atHome())
      .mockResolvedValueOnce({ ...atHome(), baseUrl: "https://node-b.example" });
    const service = new ChapterPagesService(fake.api, () => now);

    const entry = await service.getAtHome(CH1);
    await service.getAtHome(CH1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);

    // The failed baseUrl still matches the cached entry: refetch.
    await service.getAtHome(CH1, entry.baseUrl);
    expect(fake.getAtHome).toHaveBeenCalledTimes(2);

    // The failed baseUrl no longer matches the (now-refreshed) cached entry: someone else
    // already refreshed it, so this returns the cached entry without another fetch.
    const cached = await service.getAtHome(CH1, entry.baseUrl);
    expect(fake.getAtHome).toHaveBeenCalledTimes(2);
    expect(cached.baseUrl).not.toBe(entry.baseUrl);

    now = AT_HOME_TTL_MS + 1;
    await service.getAtHome(CH1);
    expect(fake.getAtHome).toHaveBeenCalledTimes(3);
  });

  it("shares one in-flight fetch across concurrent callers that need a refresh", async () => {
    const fake = fakeMangaDex({}, { [CH1]: atHome() });
    const service = new ChapterPagesService(fake.api);

    const [a, b] = await Promise.all([
      service.getAtHome(CH1, "https://stale.example"),
      service.getAtHome(CH1, "https://stale.example"),
    ]);
    expect(fake.getAtHome).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("checks whether a file belongs to the chapter", async () => {
    const service = new ChapterPagesService(fakeMangaDex({}, { [CH1]: atHome() }).api);
    const entry = await service.getAtHome(CH1);
    expect(service.hasFile(entry, "data", "1-aaa.png")).toBe(true);
    expect(service.hasFile(entry, "data-saver", "1-aaa.png")).toBe(false);
  });
});
