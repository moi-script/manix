import type { ChapterDTO, OfficialLinkDTO } from "@manix/shared";
import Link from "next/link";
import { chapterGaps, gapLabel } from "@/lib/chapter-gaps";
import { chapterLabel, formatDate, groupNames } from "@/lib/format";

const row = "flex items-center justify-between gap-4 px-2 py-3 hover:bg-gutter";

/** `official` is the title's first official English release, if it has one. */
export function ChapterList({ chapters, official }: { chapters: ChapterDTO[]; official?: OfficialLinkDTO }) {
  const gaps = chapterGaps(chapters);
  const gapBelow = new Map(gaps.map((gap) => [gap.belowChapterId, gap]));
  const leading = gaps.find((gap) => gap.from <= 1);

  return (
    <section aria-labelledby="chapters-heading" className="mt-10">
      <h2 id="chapters-heading" className="font-display text-2xl">
        Chapters
      </h2>
      {chapters.length === 0 ? (
        <p className="mt-3 text-dusk">
          {official
            ? `No English chapters are on MangaDex. Read it officially on ${official.site} above.`
            : "No English chapters are on MangaDex for this title yet."}
        </p>
      ) : (
        <>
          {leading && (
            <p role="note" className="mt-3 rounded-sm border border-rule px-3 py-2 text-sm text-dusk">
              {gapLabel(leading)} aren&apos;t on MangaDex, usually because the series is licensed.
              {official && (
                <>
                  {" "}
                  <a href={official.url} target="_blank" rel="noreferrer" className="text-marker hover:underline">
                    Read them on {official.site} <span aria-hidden>↗</span>
                  </a>
                </>
              )}
            </p>
          )}
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {[...chapters].reverse().flatMap((chapter) => {
              const label = chapterLabel(chapter);
              const meta = `${groupNames(chapter.groups)}, ${formatDate(chapter.publishedAt)}`;
              const text = (
                <span className="min-w-0">
                  <span className="block truncate">{label}</span>
                  <span className="block truncate text-xs text-dusk">{meta}</span>
                </span>
              );
              const items = [
                <li key={chapter.id}>
                  {chapter.externalUrl ? (
                    <a href={chapter.externalUrl} target="_blank" rel="noreferrer" className={row}>
                      {text}
                      <span className="shrink-0 text-xs text-dusk">Read on the publisher&apos;s site</span>
                    </a>
                  ) : (
                    <Link href={`/read/${chapter.id}`} className={row}>
                      {text}
                      <span className="shrink-0 text-xs text-dusk">{chapter.pages} pages</span>
                    </Link>
                  )}
                </li>,
              ];
              const gap = gapBelow.get(chapter.id);
              if (gap) {
                items.push(
                  <li key={`gap-${gap.from}`} className="flex items-center justify-between gap-4 px-2 py-2 text-xs text-dusk">
                    <span className="italic">{gapLabel(gap)} not on MangaDex</span>
                    {official && (
                      <a href={official.url} target="_blank" rel="noreferrer" className="shrink-0 text-marker hover:underline">
                        {official.site} <span aria-hidden>↗</span>
                      </a>
                    )}
                  </li>,
                );
              }
              return items;
            })}
          </ul>
        </>
      )}
    </section>
  );
}
