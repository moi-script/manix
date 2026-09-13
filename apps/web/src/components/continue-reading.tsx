"use client";

import type { ProgressDTO } from "@manix/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { progressPercent } from "@/lib/reader";

export function ContinueReading() {
  const { user } = useAuth();
  const [items, setItems] = useState<ProgressDTO[]>([]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      return;
    }
    let cancelled = false;
    api<{ items: ProgressDTO[] }>("/api/progress/continue")
      .then((res) => {
        if (!cancelled) setItems(res.items.filter((item) => item.manga !== null));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="continue-heading" className="mx-auto max-w-6xl px-4 pt-8">
      <h2 id="continue-heading" className="font-display text-3xl leading-none">
        Continue reading
      </h2>
      <ul className="mt-4 grid snap-x auto-cols-[80%] grid-flow-col gap-4 overflow-x-auto pb-3 sm:auto-cols-[45%] lg:auto-cols-[30%]">
        {items.map((item) => (
          <li key={item.mangaId} className="snap-start">
            <Link href={`/read/${item.chapterId}`} className="flex gap-3 rounded-sm bg-gutter p-3 hover:bg-rule">
              <span className="h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-sm bg-ink">
                {item.manga?.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- served and cached by the image proxy
                  <img src={item.manga.coverUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-between">
                <span>
                  <span className="line-clamp-2 font-medium">{item.manga?.title}</span>
                  <span className="mt-1 block text-xs text-dusk">
                    {item.chapterNumber ? `Chapter ${item.chapterNumber}` : "Current chapter"}, page {item.page + 1} of{" "}
                    {item.totalPages}
                  </span>
                </span>
                <span aria-hidden className="mt-2 block h-1 bg-ink">
                  <span
                    className="block h-full bg-marker"
                    style={{ width: `${progressPercent(item.page, item.totalPages)}%` }}
                  />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
