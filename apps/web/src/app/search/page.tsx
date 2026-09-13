import type { MangaDTO, Paginated } from "@manix/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { MangaGrid } from "@/components/manga-grid";
import { SearchFilters } from "@/components/search-filters";
import { lastPage, pageHref, readSearchParams, toApiQuery } from "@/lib/search";
import { serverApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Browse manhwa" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const values = readSearchParams(await searchParams);

  let result: Paginated<MangaDTO> | null = null;
  try {
    result = await serverApi<Paginated<MangaDTO>>(`/api/manga?${toApiQuery(values)}`, { revalidate: 60 });
  } catch {
    result = null;
  }

  const totalPages = result ? lastPage(result.total, result.pageSize) : 1;
  const pagerLink = "rounded-sm border border-rule px-4 py-2 hover:bg-gutter";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-5xl leading-none">Browse</h1>
      <SearchFilters values={values} />

      {result === null ? (
        <p role="alert" className="mt-8 text-signal">
          Search isn&apos;t available right now. Try again in a minute.
        </p>
      ) : result.items.length === 0 ? (
        <p className="mt-8 text-dusk">No titles match these filters. Try a shorter title, or set status to any.</p>
      ) : (
        <>
          <p className="mt-6 text-sm text-dusk">{result.total.toLocaleString("en-US")} titles</p>
          <MangaGrid manga={result.items} />
          <nav aria-label="Pagination" className="mt-10 flex items-center justify-between text-sm">
            {values.page > 1 ? (
              <Link href={pageHref(values, values.page - 1)} className={pagerLink}>
                Previous page
              </Link>
            ) : (
              <span />
            )}
            <span className="text-dusk">
              Page {values.page} of {totalPages}
            </span>
            {values.page < totalPages ? (
              <Link href={pageHref(values, values.page + 1)} className={pagerLink}>
                Next page
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </div>
  );
}
