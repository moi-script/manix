import type { ChapterDTO, MangaDTO } from "@manix/shared";
import type { ChapterRecord, MangaRecord } from "../sources/mangadex/mappers";

export function coverUrl(manga: Pick<MangaRecord, "sourceId" | "coverFile">): string | null {
  return manga.coverFile ? `/img/cover/${manga.sourceId}/${manga.coverFile}.512.jpg` : null;
}

export function toMangaDTO(manga: MangaRecord): MangaDTO {
  return {
    id: manga.sourceId,
    source: manga.source,
    title: manga.title,
    altTitles: [...manga.altTitles],
    description: manga.description,
    originalLanguage: manga.originalLanguage,
    status: manga.status,
    year: manga.year ?? null,
    tags: manga.tags.map((t) => ({ id: t.id, name: t.name, group: t.group })),
    contentRating: manga.contentRating,
    coverUrl: coverUrl(manga),
    authors: [...manga.authors],
    artists: [...manga.artists],
    sourceUpdatedAt: manga.sourceUpdatedAt ? new Date(manga.sourceUpdatedAt).toISOString() : null,
  };
}

export function toChapterDTO(chapter: ChapterRecord): ChapterDTO {
  return {
    id: chapter.sourceId,
    mangaId: chapter.mangaSourceId,
    number: chapter.number ?? null,
    volume: chapter.volume ?? null,
    title: chapter.title ?? null,
    language: chapter.language,
    pages: chapter.pages,
    groups: chapter.groups.map((g) => ({ id: g.id, name: g.name })),
    externalUrl: chapter.externalUrl ?? null,
    publishedAt: new Date(chapter.publishedAt).toISOString(),
  };
}
