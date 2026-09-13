import type { ContentSource, GroupDTO, TagDTO } from "@manix/shared";
import type { LocalizedString, MdChapter, MdManga, MdRelationship } from "./types";

export interface MangaRecord {
  source: ContentSource;
  sourceId: string;
  title: string;
  altTitles: string[];
  description: string;
  originalLanguage: string;
  status: string;
  year: number | null;
  tags: TagDTO[];
  contentRating: string;
  coverFile: string | null;
  authors: string[];
  artists: string[];
  sourceUpdatedAt: Date | null;
}

export interface ChapterRecord {
  source: ContentSource;
  sourceId: string;
  mangaSourceId: string;
  number: string | null;
  volume: string | null;
  title: string | null;
  language: string;
  pages: number;
  sortKey: number;
  groups: GroupDTO[];
  externalUrl: string | null;
  publishedAt: Date;
}

const PREFERRED_LANGUAGES = ["en", "ko-ro", "ja-ro", "zh-ro"];

export function pickLocalized(map: LocalizedString | undefined, preferred = PREFERRED_LANGUAGES): string {
  if (!map) return "";
  for (const lang of preferred) {
    if (map[lang]) return map[lang];
  }
  return Object.values(map)[0] ?? "";
}

function relationshipNames(relationships: MdRelationship[], type: string): string[] {
  return relationships
    .filter((r) => r.type === type)
    .map((r) => (typeof r.attributes?.name === "string" ? r.attributes.name : ""))
    .filter(Boolean);
}

export function mapManga(raw: MdManga): MangaRecord {
  const a = raw.attributes;
  const originalTitleValues = Object.values(a.title ?? {});
  const altTitleWithEnglish = a.altTitles.find((t) => typeof t.en === "string" && t.en);
  const title = a.title?.en || altTitleWithEnglish?.en || pickLocalized(a.title) || "Untitled";
  const altTitles = [...new Set([...originalTitleValues, ...a.altTitles.flatMap((t) => Object.values(t))])].filter(
    (t) => t !== title,
  );
  const cover = raw.relationships.find((r) => r.type === "cover_art");
  const coverFile = typeof cover?.attributes?.fileName === "string" ? cover.attributes.fileName : null;

  return {
    source: "mangadex",
    sourceId: raw.id,
    title,
    altTitles,
    description: pickLocalized(a.description),
    originalLanguage: a.originalLanguage,
    status: a.status,
    year: a.year ?? null,
    tags: a.tags.map((t) => ({ id: t.id, name: pickLocalized(t.attributes.name), group: t.attributes.group })),
    contentRating: a.contentRating,
    coverFile,
    authors: relationshipNames(raw.relationships, "author"),
    artists: relationshipNames(raw.relationships, "artist"),
    sourceUpdatedAt: a.updatedAt ? new Date(a.updatedAt) : null,
  };
}

export function mapChapter(raw: MdChapter): ChapterRecord {
  const a = raw.attributes;
  const parsed = a.chapter === null ? Number.NaN : Number.parseFloat(a.chapter);
  const manga = raw.relationships.find((r) => r.type === "manga");

  return {
    source: "mangadex",
    sourceId: raw.id,
    mangaSourceId: manga?.id ?? "",
    number: a.chapter,
    volume: a.volume,
    title: a.title,
    language: a.translatedLanguage,
    pages: a.pages,
    sortKey: Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER,
    groups: raw.relationships
      .filter((r) => r.type === "scanlation_group")
      .map((r) => ({ id: r.id, name: typeof r.attributes?.name === "string" ? r.attributes.name : "Unknown group" })),
    externalUrl: a.externalUrl,
    publishedAt: new Date(a.publishAt),
  };
}
