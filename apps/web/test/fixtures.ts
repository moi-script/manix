import type { ChapterDetailDTO, ChapterDTO, MangaDTO, UserDTO } from "@manix/shared";

export const MANGA_ID = "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0";
export const CH1 = "c0000000-0000-4000-8000-000000000001";
export const CH2 = "c0000000-0000-4000-8000-000000000002";
export const CH3 = "c0000000-0000-4000-8000-000000000003";

export const sampleManga: MangaDTO = {
  id: MANGA_ID,
  source: "mangadex",
  title: "Solo Leveling",
  altTitles: ["Na Honjaman Rebeleop"],
  description: "10 years ago, after the Gate appeared.",
  originalLanguage: "ko",
  status: "completed",
  year: 2018,
  tags: [
    { id: "t1", name: "Action", group: "genre" },
    { id: "t2", name: "Fantasy", group: "genre" },
  ],
  contentRating: "safe",
  coverUrl: `/img/cover/${MANGA_ID}/cover.jpg.512.jpg`,
  authors: ["Chugong"],
  artists: ["DUBU (REDICE STUDIO)"],
  sourceUpdatedAt: "2024-05-01T10:00:00.000Z",
};

export const sampleChapters: ChapterDTO[] = [
  {
    id: CH1,
    mangaId: MANGA_ID,
    number: "1",
    volume: "1",
    title: "The Weakest Hunter",
    language: "en",
    pages: 2,
    groups: [{ id: "g1", name: "Alpha Scans" }],
    externalUrl: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: CH2,
    mangaId: MANGA_ID,
    number: "2",
    volume: "1",
    title: null,
    language: "en",
    pages: 2,
    groups: [{ id: "g1", name: "Alpha Scans" }],
    externalUrl: null,
    publishedAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: CH3,
    mangaId: MANGA_ID,
    number: "3",
    volume: "1",
    title: null,
    language: "en",
    pages: 0,
    groups: [],
    externalUrl: "https://publisher.example/solo-leveling/3",
    publishedAt: "2024-01-03T00:00:00.000Z",
  },
];

export const sampleChapterDetail: ChapterDetailDTO = {
  ...sampleChapters[0],
  prevChapterId: null,
  nextChapterId: CH2,
};

export const sampleUser: UserDTO = {
  id: "u1",
  email: "reader@example.com",
  username: "reader_1",
  role: "user",
  prefs: { readerMode: "strip", dataSaver: false, contentRating: ["safe", "suggestive"] },
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
