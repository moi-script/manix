export type ContentSource = "mangadex" | "local";
export type ReadingStatus = "reading" | "plan" | "completed" | "dropped";
export type ImageQuality = "data" | "data-saver";

export interface TagDTO {
  id: string;
  name: string;
  group: string;
}

/** An official English publisher page for a title, e.g. its WEBTOON or Tapas series page. */
export interface OfficialLinkDTO {
  site: string;
  url: string;
}

export interface MangaDTO {
  id: string;
  source: ContentSource;
  title: string;
  altTitles: string[];
  description: string;
  originalLanguage: string;
  status: string;
  year: number | null;
  tags: TagDTO[];
  contentRating: string;
  coverUrl: string | null;
  authors: string[];
  artists: string[];
  sourceUpdatedAt: string | null;
  officialLinks: OfficialLinkDTO[];
}

export interface GroupDTO {
  id: string;
  name: string;
}

export interface ChapterDTO {
  id: string;
  mangaId: string;
  number: string | null;
  volume: string | null;
  title: string | null;
  language: string;
  pages: number;
  groups: GroupDTO[];
  externalUrl: string | null;
  publishedAt: string;
}

export interface ChapterDetailDTO extends ChapterDTO {
  prevChapterId: string | null;
  nextChapterId: string | null;
}

export interface ChapterPagesDTO {
  chapterId: string;
  quality: ImageQuality;
  pages: string[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface UserPrefs {
  readerMode: "strip" | "paged";
  dataSaver: boolean;
  contentRating: string[];
}

export interface UserDTO {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  prefs: UserPrefs;
}

export interface LibraryEntryDTO {
  mangaId: string;
  status: ReadingStatus;
  /** Episode the reader reached on the official site, which Manix can't see for itself. */
  officialEpisode: number | null;
  updatedAt: string;
  manga: MangaDTO | null;
}

export interface ProgressDTO {
  mangaId: string;
  chapterId: string;
  chapterNumber: string | null;
  page: number;
  totalPages: number;
  updatedAt: string;
  manga: MangaDTO | null;
}

export interface HistoryEntryDTO {
  mangaId: string;
  chapterId: string;
  readAt: string;
  manga: MangaDTO | null;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
