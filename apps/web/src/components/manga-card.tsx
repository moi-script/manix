import type { MangaDTO } from "@manix/shared";
import Link from "next/link";
import { statusLabel } from "@/lib/format";

export function MangaCard({ manga, priority = false }: { manga: MangaDTO; priority?: boolean }) {
  const meta = [statusLabel(manga.status), manga.year ? String(manga.year) : ""].filter(Boolean).join(", ");

  return (
    <Link href={`/title/${manga.id}`} className="group block">
      <div className="aspect-[3/4] overflow-hidden rounded-sm bg-gutter">
        {manga.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- covers are already resized and cached by the image proxy
          <img
            src={manga.coverUrl}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden className="flex h-full items-center justify-center font-display text-5xl text-rule">
            {manga.title.charAt(0)}
          </span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-paper group-hover:text-marker">
        {manga.title}
      </h3>
      {meta && <p className="mt-0.5 text-xs text-dusk">{meta}</p>}
    </Link>
  );
}
