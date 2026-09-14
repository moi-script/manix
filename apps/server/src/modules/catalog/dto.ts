import type { ChapterDTO, MangaDTO } from "@manix/shared";
import type { ChapterRecord, MangaRecord } from "../sources/mangadex/mappers";
import { mergeLinks } from "../sources/official-links";
import type { AniListEnrichment } from "./manga.model";

export function coverUrl(manga: Pick<MangaRecord, "sourceId" | "coverFile">): string | null {
  return manga.coverFile ? `/img/cover/${manga.sourceId}/${manga.coverFile}.512.jpg` : null;
}

export function toMangaDTO(manga: MangaRecord & AniListEnrichment): MangaDTO {
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
    // Records cached before these fields existed have neither list.
    officialLinks: mergeLinks(manga.mangadexLinks ?? [], manga.anilistLinks ?? []),
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
