import type { ChapterDetailDTO, MangaDTO } from "@manix/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Reader } from "@/components/reader";
import { ApiError } from "@/lib/api";
import { chapterLabel } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

type Params = Promise<{ chapterId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

const getChapter = cache(async (id: string) => {
  const res = await serverApi<{ chapter: ChapterDetailDTO }>(`/api/chapters/${encodeURIComponent(id)}`, { revalidate: 600 });
  return res.chapter;
});

const getManga = cache(async (id: string) => {
  const res = await serverApi<{ manga: MangaDTO }>(`/api/manga/${encodeURIComponent(id)}`, { revalidate: 3600 });
  return res.manga;
});

async function load(chapterId: string): Promise<{ chapter: ChapterDetailDTO; manga: MangaDTO }> {
  try {
    const chapter = await getChapter(chapterId);
    const manga = await getManga(chapter.mangaId);
    return { chapter, manga };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { chapterId } = await params;
  try {
    const { chapter, manga } = await load(chapterId);
    return { title: `${manga.title}, ${chapterLabel(chapter)}` };
  } catch {
    return { title: "Reader" };
  }
}

export default async function ReadPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { chapterId } = await params;
  const { page } = await searchParams;
  const initialPage = parsePage(page) - 1;
  const { chapter, manga } = await load(chapterId);

  if (chapter.externalUrl) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <p className="text-dusk">{manga.title}</p>
        <h1 className="mt-1 font-display text-4xl">{chapterLabel(chapter)}</h1>
        <p className="mt-4">This chapter is published on the official site, so Manix links to it instead of hosting it.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={chapter.externalUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-sm bg-marker px-5 py-2.5 font-medium text-ink"
          >
            Read on the publisher&apos;s site
          </a>
          <Link href={`/title/${manga.id}`} className="rounded-sm border border-rule px-5 py-2.5 hover:bg-gutter">
            Back to the title
          </Link>
        </div>
      </div>
    );
  }

  return <Reader key={chapter.id} chapter={chapter} manga={manga} initialPage={initialPage} />;
}
