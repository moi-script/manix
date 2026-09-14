"use client";

import type { LibraryEntryDTO, ReadingStatus } from "@manix/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { MangaCard } from "@/components/manga-card";
import { SignedOutPrompt } from "@/components/signed-out-prompt";
import { api } from "@/lib/api";
import { officialLinksOf } from "@/lib/format";

type Tab = ReadingStatus | "all";

const TABS: { value: Tab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "reading", label: "Reading" },
  { value: "plan", label: "Plan to read" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

type LoadState = { status: "loading" } | { status: "ready"; entries: LibraryEntryDTO[] } | { status: "error" };

export function LibraryView() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("all");
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setState({ status: "loading" });
    api<{ entries: LibraryEntryDTO[] }>(`/api/library${tab === "all" ? "" : `?status=${tab}`}`)
      .then((res) => {
        if (!cancelled) setState({ status: "ready", entries: res.entries });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [user, tab]);

  if (loading) {
    return (
      <p role="status" className="text-dusk">
        Loading your library
      </p>
    );
  }
  if (!user) return <SignedOutPrompt message="Log in to see the titles you're following." next="/library" />;

  return (
    <>
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
            className={
              tab === t.value
                ? "rounded-sm bg-paper px-3 py-1.5 text-sm text-ink"
                : "rounded-sm border border-rule px-3 py-1.5 text-sm text-dusk hover:text-paper"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {state.status === "loading" && (
        <p role="status" className="mt-6 text-dusk">
          Loading
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mt-6 text-signal">
          Your library didn&apos;t load. Refresh the page to try again.
        </p>
      )}
      {state.status === "ready" && state.entries.length === 0 && (
        <p className="mt-6 text-dusk">
          {tab === "all" ? (
            <>
              Nothing saved yet.{" "}
              <Link href="/search" className="text-paper underline underline-offset-2">
                Browse manhwa
              </Link>{" "}
              and add titles from their pages.
            </>
          ) : (
            "No titles with this status."
          )}
        </p>
      )}
      {state.status === "ready" && state.entries.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6">
          {state.entries.map((entry) => (
            <li key={entry.mangaId}>
              {entry.manga ? (
                <>
                  <MangaCard manga={entry.manga} />
                  {entry.officialEpisode != null && officialLinksOf(entry.manga)[0] && (
                    <a
                      href={officialLinksOf(entry.manga)[0].url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-xs text-marker hover:underline"
                    >
                      Episode {entry.officialEpisode} · {officialLinksOf(entry.manga)[0].site} <span aria-hidden>↗</span>
                    </a>
                  )}
                </>
              ) : (
                <Link href={`/title/${entry.mangaId}`} className="text-sm text-dusk underline underline-offset-2">
                  Open saved title
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
