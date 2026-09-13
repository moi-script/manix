import type { MangaDTO, Paginated } from "@manix/shared";
import { ContinueReading } from "@/components/continue-reading";
import { CoverShelf } from "@/components/cover-shelf";
import { serverApi } from "@/lib/server-api";

async function loadShelf(query: string): Promise<MangaDTO[] | null> {
  try {
    const result = await serverApi<Paginated<MangaDTO>>(`/api/manga?${query}`, { revalidate: 300 });
    return result.items;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const [popular, latest] = await Promise.all([
    loadShelf("origin=ko&order=followedCount"),
    loadShelf("origin=ko&order=latestUploadedChapter"),
  ]);

  if (popular === null && latest === null) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24">
        <h1 className="font-display text-4xl">Titles aren&apos;t loading right now</h1>
        <p className="mt-3 text-dusk">
          The Manix server didn&apos;t respond. Refresh in a minute. Your library and history are safe.
        </p>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">Manix</h1>
      <ContinueReading />
      {popular && popular.length > 0 && (
        <CoverShelf
          title="Popular manhwa"
          manga={popular}
          href="/search?order=followedCount"
          hrefLabel="See all popular"
          emphasis
        />
      )}
      {latest && latest.length > 0 && (
        <CoverShelf
          title="Recently updated"
          manga={latest}
          href="/search?order=latestUploadedChapter"
          hrefLabel="See all updates"
        />
      )}
    </>
  );
}
