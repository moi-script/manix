import { Schema, model } from "mongoose";
import type { ChapterRecord } from "../sources/mangadex/mappers";

export interface ChapterCache extends ChapterRecord {
  cachedAt: Date;
}

const groupSchema = new Schema({ id: String, name: String }, { _id: false, id: false });

const chapterSchema = new Schema<ChapterCache>({
  source: { type: String, required: true, enum: ["mangadex", "local"] },
  sourceId: { type: String, required: true },
  mangaSourceId: { type: String, required: true },
  number: { type: String, default: null },
  volume: { type: String, default: null },
  title: { type: String, default: null },
  language: { type: String, required: true },
  pages: { type: Number, default: 0 },
  sortKey: { type: Number, required: true },
  groups: { type: [groupSchema], default: [] },
  externalUrl: { type: String, default: null },
  publishedAt: { type: Date, required: true },
  cachedAt: { type: Date, required: true },
});

chapterSchema.index({ source: 1, sourceId: 1 }, { unique: true });
chapterSchema.index({ mangaSourceId: 1, language: 1, sortKey: 1, publishedAt: 1 });

export const Chapter = model<ChapterCache>("Chapter", chapterSchema);

export interface FeedCacheAttrs {
  mangaSourceId: string;
  language: string;
  cachedAt: Date;
}

const feedCacheSchema = new Schema<FeedCacheAttrs>({
  mangaSourceId: { type: String, required: true },
  language: { type: String, required: true },
  cachedAt: { type: Date, required: true },
});

feedCacheSchema.index({ mangaSourceId: 1, language: 1 }, { unique: true });

export const FeedCache = model<FeedCacheAttrs>("FeedCache", feedCacheSchema);
