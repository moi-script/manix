import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../src/modules/auth/user.model";
import { Manga } from "../src/modules/catalog/manga.model";
import { History } from "../src/modules/library/history.model";
import { LibraryEntry } from "../src/modules/library/library.model";
import { LibraryService } from "../src/modules/library/library.service";
import { Progress } from "../src/modules/library/progress.model";
import { buildTestApp, registerAgent, type TestApp } from "./helpers/app";
import { clearTestDb, startTestDb, stopTestDb } from "./helpers/db";
import { fakeMangaDex } from "./helpers/fake-mangadex";
import { CH1, CH2A, MANGA_ID, standardHandlers } from "./helpers/fixtures";

describe("library, progress, and history", () => {
  let app: TestApp;

  beforeAll(async () => {
    await startTestDb();
    await Promise.all([User.init(), Manga.init(), LibraryEntry.init(), Progress.init(), History.init()]);
  });
  beforeEach(() => {
    app = buildTestApp({ mangadex: fakeMangaDex(standardHandlers()).api });
  });
  afterEach(clearTestDb);
  afterAll(stopTestDb);

  it("requires login", async () => {
    const routes = [
      ["get", "/api/library"],
      ["put", `/api/library/${MANGA_ID}`],
      ["put", "/api/progress"],
      ["get", "/api/progress/continue"],
      ["get", "/api/history"],
    ] as const;
    for (const [method, url] of routes) {
      const res = await request(app)[method](url);
      expect(res.status, `${method} ${url}`).toBe(401);
    }
  });

  it("adds, lists, updates, and removes library entries", async () => {
    const agent = await registerAgent(app);

    const added = await agent.put(`/api/library/${MANGA_ID}`).send({ status: "reading" });
    expect(added.status).toBe(200);
    expect(added.body.entry).toMatchObject({ mangaId: MANGA_ID, status: "reading", manga: { title: "Solo Leveling" } });

    await agent.put(`/api/library/${MANGA_ID}`).send({ status: "completed" });
    const list = await agent.get("/api/library");
    expect(list.body.entries).toHaveLength(1);
    expect(list.body.entries[0]).toMatchObject({ status: "completed", manga: { id: MANGA_ID } });
    expect((await agent.get("/api/library?status=reading")).body.entries).toHaveLength(0);
    expect((await agent.get(`/api/library/${MANGA_ID}`)).body.entry.status).toBe("completed");

    expect((await agent.delete(`/api/library/${MANGA_ID}`)).status).toBe(204);
    expect((await agent.get(`/api/library/${MANGA_ID}`)).body.entry).toBeNull();
  });

  it("keeps each user's library private", async () => {
    const alice = await registerAgent(app);
    const bob = await registerAgent(app);
    await alice.put(`/api/library/${MANGA_ID}`).send({ status: "reading" });
    expect((await bob.get("/api/library")).body.entries).toEqual([]);
  });

  it("rejects unknown manga and invalid statuses", async () => {
    const agent = await registerAgent(app);
    const unknown = await agent.put("/api/library/11111111-1111-4111-8111-111111111111").send({ status: "reading" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe("manga_not_found");

    const invalid = await agent.put(`/api/library/${MANGA_ID}`).send({ status: "binge" });
    expect(invalid.status).toBe(400);
  });

  it("saves progress, powers continue reading, and records history", async () => {
    const agent = await registerAgent(app);

    const saved = await agent
      .put("/api/progress")
      .send({ mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 3, totalPages: 20 });
    expect(saved.status).toBe(200);
    expect(saved.body.progress).toMatchObject({ mangaId: MANGA_ID, chapterId: CH1, page: 3, totalPages: 20 });
    await History.updateOne({ chapterSourceId: CH1 }, { $set: { readAt: new Date(Date.now() - 60_000) } });

    await agent
      .put("/api/progress")
      .send({ mangaId: MANGA_ID, chapterId: CH2A, chapterNumber: "2", page: 0, totalPages: 18 });

    const current = await agent.get(`/api/progress/${MANGA_ID}`);
    expect(current.body.progress).toMatchObject({ chapterId: CH2A, chapterNumber: "2", page: 0 });

    const continueReading = await agent.get("/api/progress/continue");
    expect(continueReading.body.items).toHaveLength(1);
    expect(continueReading.body.items[0].manga.title).toBe("Solo Leveling");

    const history = await agent.get("/api/history");
    expect(history.body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
    expect(history.body.items.map((h: { chapterId: string }) => h.chapterId)).toEqual([CH2A, CH1]);
  });

  it("saves the episode reached on the official site, adding the title as reading", async () => {
    const agent = await registerAgent(app);

    const saved = await agent.put(`/api/library/${MANGA_ID}/official-episode`).send({ episode: 45 });
    expect(saved.status).toBe(200);
    expect(saved.body.entry).toMatchObject({ mangaId: MANGA_ID, status: "reading", officialEpisode: 45 });

    await agent.put(`/api/library/${MANGA_ID}`).send({ status: "completed" });
    await agent.put(`/api/library/${MANGA_ID}/official-episode`).send({ episode: 46 });
    const entry = (await agent.get(`/api/library/${MANGA_ID}`)).body.entry;
    expect(entry).toMatchObject({ status: "completed", officialEpisode: 46 });
    expect((await agent.get("/api/library")).body.entries[0].officialEpisode).toBe(46);
  });

  it("validates the official episode and requires login", async () => {
    expect((await request(app).put(`/api/library/${MANGA_ID}/official-episode`).send({ episode: 1 })).status).toBe(401);
    const agent = await registerAgent(app);
    for (const episode of [-1, 1.5, "12", 100_001]) {
      expect((await agent.put(`/api/library/${MANGA_ID}/official-episode`).send({ episode })).status).toBe(400);
    }
  });

  it("reports no official episode for entries that never set one", async () => {
    const agent = await registerAgent(app);
    const added = await agent.put(`/api/library/${MANGA_ID}`).send({ status: "plan" });
    expect(added.body.entry.officialEpisode).toBeNull();
  });

  it("records each chapter once in history", async () => {
    const agent = await registerAgent(app);
    const body = { mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 1, totalPages: 20 };
    await agent.put("/api/progress").send(body);
    await agent.put("/api/progress").send({ ...body, page: 5 });
    expect((await agent.get("/api/history")).body.total).toBe(1);
  });

  it("trims history to the configured limit, keeping the newest entries", async () => {
    const agent = await registerAgent(app);
    await agent.put("/api/progress").send({ mangaId: MANGA_ID, chapterId: CH1, chapterNumber: "1", page: 1, totalPages: 20 });
    const user = await User.findOne({}).lean();
    const userId = String(user!._id);
    await History.insertMany(
      Array.from({ length: 5 }, (_, i) => ({
        userId,
        mangaSourceId: MANGA_ID,
        chapterSourceId: `older-${i}`,
        readAt: new Date(Date.now() - (i + 1) * 60_000),
      })),
    );

    const service = new LibraryService({ getManga: async () => Promise.reject(new Error("unused")) }, 3);
    await service.trimHistory(userId);

    const remaining = await History.find({ userId }).sort({ readAt: -1 }).lean();
    expect(remaining.map((h) => h.chapterSourceId)).toEqual([CH1, "older-0", "older-1"]);
  });
});
