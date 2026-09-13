import { Schema, model } from "mongoose";
import type { MangaRecord } from "../sources/mangadex/mappers";

export interface MangaCache extends MangaRecord {
  cachedAt: Date;
}

const tagSchema = new Schema({ id: String, name: String, group: String }, { _id: false, id: false });

const mangaSchema = new Schema<MangaCache>({
  source: { type: String, required: true, enum: ["mangadex", "local"] },
  sourceId: { type: String, required: true },
  title: { type: String, required: true },
  altTitles: { type: [String], default: [] },
  description: { type: String, default: "" },
  originalLanguage: { type: String, default: "" },
  status: { type: String, default: "" },
  year: { type: Number, default: null },
  tags: { type: [tagSchema], default: [] },
  contentRating: { type: String, default: "safe" },
  coverFile: { type: String, default: null },
  authors: { type: [String], default: [] },
  artists: { type: [String], default: [] },
  sourceUpdatedAt: { type: Date, default: null },
  cachedAt: { type: Date, required: true },
});

mangaSchema.index({ source: 1, sourceId: 1 }, { unique: true });
mangaSchema.index({ title: "text", altTitles: "text" }, { default_language: "none" });
mangaSchema.index({ sourceUpdatedAt: -1 });

export const Manga = model<MangaCache>("Manga", mangaSchema);
