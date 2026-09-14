export type LocalizedString = Record<string, string>;

export interface MdRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MdTag {
  id: string;
  type: "tag";
  attributes: { name: LocalizedString; group: string };
}

export interface MdManga {
  id: string;
  type: "manga";
  attributes: {
    title: LocalizedString;
    altTitles: LocalizedString[];
    description: LocalizedString;
    originalLanguage: string;
    status: string;
    year: number | null;
    contentRating: string;
    tags: MdTag[];
    /** Short keys to external sites: "al" is the AniList id, "engtl" the official English URL. */
    links?: Record<string, string> | null;
    updatedAt: string;
  };
  relationships: MdRelationship[];
}

export interface MdChapter {
  id: string;
  type: "chapter";
  attributes: {
    volume: string | null;
    chapter: string | null;
    title: string | null;
    translatedLanguage: string;
    externalUrl: string | null;
    publishAt: string;
    pages: number;
  };
  relationships: MdRelationship[];
}

export interface MdEntityResponse<T> {
  result: "ok";
  data: T;
}

export interface MdCollectionResponse<T> {
  result: "ok";
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface MdAtHomeResponse {
  result: "ok";
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}
