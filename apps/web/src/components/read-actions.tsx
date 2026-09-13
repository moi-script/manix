"use client";

import type { LibraryEntryDTO, ProgressDTO, ReadingStatus } from "@manix/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";

const STATUS_OPTIONS: { value: ReadingStatus | ""; label: string }[] = [
  { value: "", label: "Not in library" },
  { value: "reading", label: "Reading" },
  { value: "plan", label: "Plan to read" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

const SAVE_MESSAGES = { idle: "", saving: "Saving", saved: "Saved", error: "Couldn't save. Try again." } as const;

export function ReadActions({ mangaId, firstChapterId }: { mangaId: string; firstChapterId: string | null }) {
  const { user, loading } = useAuth();
  const [progress, setProgress] = useState<ProgressDTO | null>(null);
  const [status, setStatus] = useState<ReadingStatus | "">("");
  const [saveState, setSaveState] = useState<keyof typeof SAVE_MESSAGES>("idle");

  useEffect(() => {
    if (!user) {
      setProgress(null);
      setStatus("");
      return;
    }
    let cancelled = false;
    Promise.all([
      api<{ progress: ProgressDTO | null }>(`/api/progress/${mangaId}`),
      api<{ entry: LibraryEntryDTO | null }>(`/api/library/${mangaId}`),
    ])
      .then(([progressRes, libraryRes]) => {
        if (cancelled) return;
        setProgress(progressRes.progress);
        setStatus(libraryRes.entry?.status ?? "");
      })
      .catch(() => {
        // Keep the signed-out defaults; the read link still works.
      });
    return () => {
      cancelled = true;
    };
  }, [user, mangaId]);

  async function changeStatus(next: ReadingStatus | "") {
    const previous = status;
    setStatus(next);
    setSaveState("saving");
    try {
      if (next === "") await api(`/api/library/${mangaId}`, { method: "DELETE" });
      else await api(`/api/library/${mangaId}`, { method: "PUT", body: { status: next } });
      setSaveState("saved");
    } catch {
      setStatus(previous);
      setSaveState("error");
    }
  }

  const readHref = progress ? `/read/${progress.chapterId}` : firstChapterId ? `/read/${firstChapterId}` : null;
  const readLabel = progress
    ? progress.chapterNumber
      ? `Continue chapter ${progress.chapterNumber}`
      : "Continue reading"
    : "Start reading";

  return (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
      {readHref ? (
        <Link href={readHref} className="rounded-sm bg-marker px-5 py-2.5 font-medium text-ink">
          {readLabel}
        </Link>
      ) : (
        <span className="rounded-sm border border-rule px-5 py-2.5 text-dusk">No chapters to read here yet</span>
      )}

      {loading ? null : user ? (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="library-status" className="text-dusk">
            Library
          </label>
          <select
            id="library-status"
            value={status}
            onChange={(event) => void changeStatus(event.target.value as ReadingStatus | "")}
            className="rounded-sm border border-rule bg-gutter px-3 py-2 text-paper"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span aria-live="polite" className={saveState === "error" ? "text-xs text-signal" : "text-xs text-dusk"}>
            {SAVE_MESSAGES[saveState]}
          </span>
        </div>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/title/${mangaId}`)}`}
          className="text-sm text-dusk underline underline-offset-2 hover:text-paper"
        >
          Log in to save this to your library
        </Link>
      )}
    </div>
  );
}
