import type { MangaDTO } from "@manix/shared";
import Link from "next/link";
import { MangaCard } from "@/components/manga-card";

interface CoverShelfProps {
  title: string;
  manga: MangaDTO[];
  href?: string;
  hrefLabel?: string;
  /** The first shelf on the page gets poster-sized type and eager covers. */
  emphasis?: boolean;
}

export function CoverShelf({ title, manga, href, hrefLabel, emphasis = false }: CoverShelfProps) {
  const headingId = `shelf-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-end justify-between gap-4">
        <h2
          id={headingId}
          className={emphasis ? "font-display text-5xl leading-none sm:text-7xl" : "font-display text-3xl leading-none"}
        >
          {title}
        </h2>
        {href && hrefLabel && (
          <Link href={href} className="shrink-0 text-sm text-dusk hover:text-paper">
            {hrefLabel}
          </Link>
        )}
      </div>
      <ul className="mt-5 grid snap-x auto-cols-[42%] grid-flow-col gap-4 overflow-x-auto pb-3 sm:auto-cols-[23%] lg:auto-cols-[15.5%]">
        {manga.map((m, i) => (
          <li key={m.id} className="snap-start">
            <MangaCard manga={m} priority={emphasis && i < 6} />
          </li>
        ))}
      </ul>
    </section>
  );
}
