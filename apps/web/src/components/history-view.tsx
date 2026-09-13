"use client";

import type { HistoryEntryDTO, Paginated } from "@manix/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { SignedOutPrompt } from "@/components/signed-out-prompt";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export function HistoryView() {
  const { user, loading } = useAuth();
  const [items, setItems] = useState<HistoryEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setStatus("loading");
    api<Paginated<HistoryEntryDTO>>(`/api/history?page=${page}`)
      .then((res) => {
        if (cancelled) return;
        setItems((previous) => (page === 1 ? res.items : [...previous, ...res.items]));
        setTotal(res.total);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user, page]);

  if (loading) {
    return (
      <p role="status" className="text-dusk">
        Loading your history
      </p>
    );
  }
  if (!user) return <SignedOutPrompt message="Log in to see the chapters you've read." next="/history" />;

  if (status === "ready" && items.length === 0) {
    return <p className="text-dusk">Chapters you open show up here.</p>;
  }

  return (
    <>
      {status === "error" && (
        <p role="alert" className="mb-4 text-signal">
          History didn&apos;t load. Refresh the page to try again.
        </p>
      )}
      <ul className="divide-y divide-rule border-y border-rule">
        {items.map((item) => (
          <li key={item.chapterId}>
            <Link href={`/read/${item.chapterId}`} className="flex items-center gap-4 px-2 py-3 hover:bg-gutter">
              <span className="h-16 w-12 shrink-0 overflow-hidden rounded-sm bg-gutter">
                {item.manga?.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- served and cached by the image proxy
                  <img src={item.manga.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="min-w-0">
                <span className="block truncate">{item.manga?.title ?? "Saved title"}</span>
                <span className="block text-xs text-dusk">Read {formatDate(item.readAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length < total && (
        <button
          type="button"
          disabled={status === "loading"}
          onClick={() => setPage((p) => p + 1)}
          className="mt-6 rounded-sm border border-rule px-5 py-2.5 text-sm hover:bg-gutter disabled:opacity-60"
        >
          Show older history
        </button>
      )}
    </>
  );
}
