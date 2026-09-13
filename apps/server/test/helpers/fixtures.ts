import type {
  MdAtHomeResponse,
  MdChapter,
  MdCollectionResponse,
  MdEntityResponse,
  MdManga,
} from "../../src/modules/sources/mangadex/types";
import atHomeJson from "../fixtures/at-home.json";
import chaptersJson from "../fixtures/chapters.json";
import mangaJson from "../fixtures/manga.json";

export const MANGA_ID = "32d76d19-8a05-4db0-9fc2-e0b0648fe9d0";
export const CH1 = "c0000000-0000-4000-8000-000000000001";
export const CH2A = "c0000000-0000-4000-8000-000000000002";
export const CH2B = "c0000000-0000-4000-8000-000000000003";
export const CH3 = "c0000000-0000-4000-8000-000000000004";
export const GROUP_A = "aaaaaaaa-0000-4000-8000-000000000001";
export const GROUP_B = "bbbbbbbb-0000-4000-8000-000000000002";
export const COVER_FILE = "e90bdc47-c8b9-4df7-b2c0-17641b645ee1.jpg";

export const mangaEntity = () => structuredClone(mangaJson) as unknown as MdEntityResponse<MdManga>;

export const chapterFeed = () => structuredClone(chaptersJson) as unknown as MdCollectionResponse<MdChapter>;

export function chapterEntity(id: string): MdEntityResponse<MdChapter> {
  const chapter = chapterFeed().data.find((c) => c.id === id);
  if (!chapter) throw new Error(`No fixture chapter ${id}`);
  return { result: "ok", data: chapter };
}

export const atHome = () => structuredClone(atHomeJson) as unknown as MdAtHomeResponse;

export function standardHandlers(): Record<string, unknown> {
  return {
    [`/manga/${MANGA_ID}`]: mangaEntity(),
    [`/manga/${MANGA_ID}/feed`]: chapterFeed(),
    [`/chapter/${CH1}`]: chapterEntity(CH1),
    [`/chapter/${CH2A}`]: chapterEntity(CH2A),
    [`/chapter/${CH2B}`]: chapterEntity(CH2B),
    [`/chapter/${CH3}`]: chapterEntity(CH3),
  };
}
