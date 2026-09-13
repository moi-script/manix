import type { MangaDTO } from "@manix/shared";
import { MangaCard } from "@/components/manga-card";

export function MangaGrid({ manga }: { manga: MangaDTO[] }) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
      {manga.map((m) => (
        <li key={m.id}>
          <MangaCard manga={m} />
        </li>
      ))}
    </ul>
  );
}
