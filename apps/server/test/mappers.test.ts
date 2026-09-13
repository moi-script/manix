import { describe, expect, it } from "vitest";
import { mapChapter, mapManga, pickLocalized } from "../src/modules/sources/mangadex/mappers";
import { CH1, CH2B, chapterEntity, COVER_FILE, GROUP_A, MANGA_ID, mangaEntity } from "./helpers/fixtures";

describe("pickLocalized", () => {
  it("prefers English, then romanized, then anything", () => {
    expect(pickLocalized({ ko: "native", en: "Me" })).toBe("Me");
    expect(pickLocalized({ ko: "native", "ko-ro": "Na" })).toBe("Na");
    expect(pickLocalized({ ko: "native" })).toBe("native");
    expect(pickLocalized({})).toBe("");
    expect(pickLocalized(undefined)).toBe("");
  });
});

describe("mapManga", () => {
  it("maps a MangaDex manga to a cache record", () => {
    expect(mapManga(mangaEntity().data)).toEqual({
      source: "mangadex",
      sourceId: MANGA_ID,
      title: "Solo Leveling",
      altTitles: ["Na Honjaman Rebeleop (ko)", "Na Honjaman Rebeleop"],
      description: "10 years ago, after the Gate appeared.",
      originalLanguage: "ko",
      status: "completed",
      year: 2018,
      tags: [
        { id: "391b0423-d847-456f-aff0-8b0cfc03066b", name: "Action", group: "genre" },
        { id: "cdc58593-87dd-415e-bbc0-2ec27bf404cc", name: "Fantasy", group: "genre" },
      ],
      contentRating: "safe",
      coverFile: COVER_FILE,
      authors: ["Chugong"],
      artists: ["DUBU (REDICE STUDIO)"],
      sourceUpdatedAt: new Date("2024-05-01T10:00:00+00:00"),
    });
  });

  it("falls back to Untitled and a null cover", () => {
    const raw = mangaEntity().data;
    raw.attributes.title = {};
    raw.attributes.altTitles = [];
    raw.relationships = [];
    const record = mapManga(raw);
    expect(record.title).toBe("Untitled");
    expect(record.coverFile).toBeNull();
  });

  it("prefers an English altTitles entry over the romanized original title", () => {
    const raw = mangaEntity().data;
    raw.attributes.title = { "ko-ro": "Na Honjaman Rebeleop" };
    raw.attributes.altTitles = [{ en: "Solo Leveling" }, { ko: "나 혼자만 레벨업" }];
    const record = mapManga(raw);
    expect(record.title).toBe("Solo Leveling");
    expect(record.altTitles[0]).toBe("Na Honjaman Rebeleop");
  });
});

describe("mapChapter", () => {
  it("maps a chapter with groups, manga id, and numeric sort key", () => {
    expect(mapChapter(chapterEntity(CH1).data)).toEqual({
      source: "mangadex",
      sourceId: CH1,
      mangaSourceId: MANGA_ID,
      number: "1",
      volume: "1",
      title: "The Weakest Hunter",
      language: "en",
      pages: 2,
      sortKey: 1,
      groups: [{ id: GROUP_A, name: "Alpha Scans" }],
      externalUrl: null,
      publishedAt: new Date("2024-01-01T00:00:00+00:00"),
    });
  });

  it("sorts unnumbered chapters last", () => {
    const raw = chapterEntity(CH2B).data;
    raw.attributes.chapter = null;
    expect(mapChapter(raw).sortKey).toBe(Number.MAX_SAFE_INTEGER);
  });
});
