import type { ChapterDTO } from "@manix/shared";
import Link from "next/link";
import { chapterLabel, formatDate, groupNames } from "@/lib/format";

const row = "flex items-center justify-between gap-4 px-2 py-3 hover:bg-gutter";

export function ChapterList({ chapters }: { chapters: ChapterDTO[] }) {
  return (
    <section aria-labelledby="chapters-heading" className="mt-10">
      <h2 id="chapters-heading" className="font-display text-2xl">
        Chapters
      </h2>
      {chapters.length === 0 ? (
        <p className="mt-3 text-dusk">No English chapters are on MangaDex for this title yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {[...chapters].reverse().map((chapter) => {
            const label = chapterLabel(chapter);
            const meta = `${groupNames(chapter.groups)}, ${formatDate(chapter.publishedAt)}`;
            const text = (
              <span className="min-w-0">
                <span className="block truncate">{label}</span>
                <span className="block truncate text-xs text-dusk">{meta}</span>
              </span>
            );
            return (
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
