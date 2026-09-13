import type { ChapterDTO, MangaDTO } from "@manix/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ChapterList } from "@/components/chapter-list";
import { ReadActions } from "@/components/read-actions";
import { ApiError } from "@/lib/api";
import { plainDescription, statusLabel } from "@/lib/format";
import { serverApi } from "@/lib/server-api";

type Params = Promise<{ id: string }>;

const getManga = cache(async (id: string) => {
  const res = await serverApi<{ manga: MangaDTO }>(`/api/manga/${encodeURIComponent(id)}`, { revalidate: 3600 });
  return res.manga;
});

const getChapters = cache(async (id: string) => {
  const res = await serverApi<{ chapters: ChapterDTO[] }>(`/api/manga/${encodeURIComponent(id)}/chapters?lang=en`, {
    revalidate: 600,
  });
  return res.chapters;
});

function isMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 400);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  try {
    const manga = await getManga(id);
    return { title: manga.title, description: plainDescription(manga.description).slice(0, 160) };
  } catch {
    return { title: "Title" };
  }
}

export default async function TitlePage({ params }: { params: Params }) {
  const { id } = await params;

  let manga: MangaDTO;
  let chapters: ChapterDTO[];
  try {
    [manga, chapters] = await Promise.all([getManga(id), getChapters(id)]);
  } catch (err) {
    if (isMissing(err)) notFound();
    throw err;
  }

  const details = [
    { term: "Story", value: manga.authors.join(", ") },
    { term: "Art", value: manga.artists.join(", ") },
    { term: "Status", value: statusLabel(manga.status) },
    { term: "Year", value: manga.year ? String(manga.year) : "" },
  ].filter((d) => d.value);
  const genres = manga.tags.filter((t) => t.group === "genre" || t.group === "theme").map((t) => t.name);
  const description = plainDescription(manga.description);
  const firstReadable = chapters.find((c) => !c.externalUrl) ?? null;

  return (
    <article className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <div className="md:sticky md:top-20 md:self-start">
          <div className="mx-auto aspect-[3/4] w-48 overflow-hidden rounded-sm bg-gutter md:w-full">
            {manga.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- served and cached by the image proxy
              <img src={manga.coverUrl} alt={`Cover of ${manga.title}`} className="h-full w-full object-cover" />
            )}
          </div>
        </div>

        <div className="min-w-0">
          <h1 className="font-display text-4xl leading-tight sm:text-6xl sm:leading-none">{manga.title}</h1>
          {manga.altTitles[0] && <p className="mt-3 text-dusk">{manga.altTitles[0]}</p>}

          {details.length > 0 && (
            <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {details.map((d) => (
                <div key={d.term} className="contents">
                  <dt className="text-dusk">{d.term}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {genres.length > 0 && <p className="mt-3 text-sm text-dusk">{genres.join(", ")}</p>}

          <ReadActions mangaId={manga.id} firstChapterId={firstReadable?.id ?? null} />

          {description && (
            <p className="mt-8 max-w-prose whitespace-pre-line leading-relaxed text-paper/90">{description}</p>
          )}

          <ChapterList chapters={chapters} />
        </div>
      </div>
    </article>
  );
}
