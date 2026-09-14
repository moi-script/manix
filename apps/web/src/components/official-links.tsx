"use client";

import type { LibraryEntryDTO, OfficialLinkDTO } from "@manix/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";

const SAVE_MESSAGES = { idle: "", saving: "Saving", saved: "Saved", error: "Couldn't save. Try again." } as const;
const MAX_EPISODE = 100_000;

export function OfficialLinks({ mangaId, links }: { mangaId: string; links: OfficialLinkDTO[] }) {
  const { user, loading } = useAuth();
  const [episode, setEpisode] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<keyof typeof SAVE_MESSAGES>("idle");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api<{ entry: LibraryEntryDTO | null }>(`/api/library/${mangaId}`)
      .then((res) => {
        if (cancelled) return;
        const saved = res.entry?.officialEpisode ?? null;
        setEpisode(saved);
        setDraft(saved === null ? "" : String(saved));
      })
      .catch(() => {
        // The links still work without the tracker's saved value.
      });
    return () => {
      cancelled = true;
    };
  }, [user, mangaId]);

  if (links.length === 0) return null;

  async function save(next: number) {
    if (!Number.isInteger(next) || next < 0 || next > MAX_EPISODE || next === episode) {
      setDraft(episode === null ? "" : String(episode));
      return;
    }
    const previous = episode;
    setEpisode(next);
    setDraft(String(next));
    setSaveState("saving");
    try {
      await api(`/api/library/${mangaId}/official-episode`, { method: "PUT", body: { episode: next } });
      setSaveState("saved");
    } catch {
      setEpisode(previous);
      setDraft(previous === null ? "" : String(previous));
      setSaveState("error");
    }
  }

  return (
    <section aria-labelledby="official-heading" className="mt-8 rounded-sm border border-rule p-4">
      <h2 id="official-heading" className="font-display text-2xl">
        Read in English officially
      </h2>
      <p className="mt-1 text-sm text-dusk">Supports the creators, and often has chapters MangaDex can&apos;t host.</p>

      <ul className="mt-4 flex flex-wrap gap-2">
        {links.map((link) => (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-block rounded-sm bg-marker px-4 py-2 font-medium text-ink"
            >
              {link.site} <span aria-hidden>↗</span>
            </a>
          </li>
        ))}
      </ul>

      {loading ? null : user ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="official-episode" className="text-dusk">
            Episode you&apos;re on
          </label>
          <input
            id="official-episode"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_EPISODE}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim() !== "") void save(Number(draft));
            }}
            onBlur={() => {
              if (draft.trim() !== "") void save(Number(draft));
            }}
            disabled={saveState === "saving"}
            className="w-24 rounded-sm border border-rule bg-gutter px-3 py-2 text-paper"
          />
          <button
            type="button"
            onClick={() => void save((episode ?? 0) + 1)}
            disabled={saveState === "saving"}
            className="rounded-sm border border-rule px-3 py-2 text-paper hover:bg-gutter"
          >
            +1
          </button>
          <span aria-live="polite" className={saveState === "error" ? "text-xs text-signal" : "text-xs text-dusk"}>
            {SAVE_MESSAGES[saveState]}
          </span>
        </div>
      ) : (
        <Link
          href={`/login?next=${encodeURIComponent(`/title/${mangaId}`)}`}
          className="mt-4 inline-block text-sm text-dusk underline underline-offset-2 hover:text-paper"
        >
          Log in to track your episode
        </Link>
      )}
    </section>
  );
}
