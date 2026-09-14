import type { ChapterDTO, GroupDTO, MangaDTO, OfficialLinkDTO } from "@manix/shared";

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "On hiatus",
  cancelled: "Cancelled",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? "";
}

export function chapterLabel(chapter: Pick<ChapterDTO, "number" | "title">): string {
  const base = chapter.number ? `Chapter ${chapter.number}` : "Oneshot";
  return chapter.title ? `${base}: ${chapter.title}` : base;
}

export function groupNames(groups: GroupDTO[]): string {
  const names = groups.map((g) => g.name);
  if (names.length === 0) return "No group credited";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** MangaDex descriptions contain markdown; show them as plain text. */
export function plainDescription(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/^[ \t]*-{3,}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** An API deployed before official links existed omits the field, so treat it as optional. */
export function officialLinksOf(manga: Pick<MangaDTO, "officialLinks">): OfficialLinkDTO[] {
  return Array.isArray(manga.officialLinks) ? manga.officialLinks : [];
}
