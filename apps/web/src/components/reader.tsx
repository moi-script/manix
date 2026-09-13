"use client";

import type { ChapterDetailDTO, ChapterPagesDTO, MangaDTO } from "@manix/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api, ApiError } from "@/lib/api";
import { chapterLabel, groupNames } from "@/lib/format";
import { DEFAULT_PREFS, loadPrefs, savePrefs, type ReaderPrefs } from "@/lib/prefs";
import { nearEnd, pageFromScroll, PRELOAD_AHEAD, preloadRange, progressPercent } from "@/lib/reader";

export const PROGRESS_DEBOUNCE_MS = 2000;

type PagesState = { status: "loading" } | { status: "ready"; pages: string[] } | { status: "error"; message: string };

const NO_PAGES: string[] = [];
const toolButton =
  "rounded-sm border border-rule px-3 py-1.5 text-xs text-dusk hover:text-paper aria-pressed:border-marker aria-pressed:text-marker";
const primaryButton = "rounded-sm bg-marker px-5 py-2.5 font-medium text-ink";
const secondaryButton = "rounded-sm border border-rule px-5 py-2.5 text-paper hover:bg-gutter";

export function Reader({ chapter, manga }: { chapter: ChapterDetailDTO; manga: MangaDTO }) {
  const router = useRouter();
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [pagesState, setPagesState] = useState<PagesState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0);
  const [loadedPages, setLoadedPages] = useState<ReadonlySet<number>>(new Set());
  const [scrollingDown, setScrollingDown] = useState(false);
  const imageRefs = useRef<(HTMLImageElement | null)[]>([]);
  const warmedNext = useRef(false);

  const pages = pagesState.status === "ready" ? pagesState.pages : NO_PAGES;
  const total = pages.length;
  const quality = prefs.dataSaver ? "data-saver" : "data";

  // Read stored prefs after mount so server and client render the same markup.
  useEffect(() => {
    setPrefs(loadPrefs());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    let cancelled = false;
    setPagesState({ status: "loading" });
    setLoadedPages(new Set());
    api<ChapterPagesDTO>(`/api/chapters/${chapter.id}/pages?quality=${quality}`)
      .then((res) => {
        if (!cancelled) setPagesState({ status: "ready", pages: res.pages });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPagesState({
          status: "error",
          message:
            err instanceof ApiError && err.status === 429
              ? "You're opening chapters quickly. Wait a moment, then try again."
              : "This chapter's pages didn't load. The source may be busy.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [chapter.id, quality, attempt, prefsReady]);

  const goToChapter = useCallback(
    (id: string | null) => {
      if (id) router.push(`/read/${id}`);
    },
    [router],
  );

  const nextPage = useCallback(() => {
    if (page < total - 1) setPage(page + 1);
    else goToChapter(chapter.nextChapterId);
  }, [page, total, goToChapter, chapter.nextChapterId]);

  const previousPage = useCallback(() => {
    if (page > 0) setPage(page - 1);
    else goToChapter(chapter.prevChapterId);
  }, [page, goToChapter, chapter.prevChapterId]);

  // Decode upcoming pages before the reader reaches them.
  useEffect(() => {
    for (const index of preloadRange(page, total)) {
      const img = new Image();
      img.decoding = "async";
      img.src = pages[index];
    }
  }, [page, total, pages]);

  // Near the end, warm the next chapter so it opens instantly.
  useEffect(() => {
    if (warmedNext.current || !chapter.nextChapterId || !nearEnd(page, total)) return;
    warmedNext.current = true;
    router.prefetch(`/read/${chapter.nextChapterId}`);
    api(`/api/chapters/${chapter.nextChapterId}/pages?quality=${quality}`).catch(() => undefined);
  }, [page, total, chapter.nextChapterId, quality, router]);

  // Save progress once the reader settles on a page.
  useEffect(() => {
    if (!user || total === 0) return;
    const timer = setTimeout(() => {
      api("/api/progress", {
        method: "PUT",
        body: { mangaId: manga.id, chapterId: chapter.id, chapterNumber: chapter.number, page, totalPages: total },
      }).catch(() => undefined);
    }, PROGRESS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [user, page, total, manga.id, chapter.id, chapter.number]);

  // Long strip: track the current page, and slide the toolbar away while scrolling down.
  useEffect(() => {
    if (prefs.mode !== "strip" || total === 0) return;
    let frame = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrollingDown(y > lastY && y > 160);
        lastY = y;
        const offsets = imageRefs.current
          .slice(0, total)
          .map((el) => (el ? el.getBoundingClientRect().top + y : Number.POSITIVE_INFINITY));
        setPage(pageFromScroll(offsets, y, window.innerHeight));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [prefs.mode, total]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;

      if (prefs.mode === "paged") {
        if (event.key === "ArrowRight" || event.key === "j") {
          event.preventDefault();
          nextPage();
        } else if (event.key === "ArrowLeft" || event.key === "k") {
          event.preventDefault();
          previousPage();
        }
      } else if (event.key === "j" || event.key === "k") {
        window.scrollBy({ top: (event.key === "j" ? 0.9 : -0.9) * window.innerHeight });
      } else if (event.key === "ArrowRight") {
        goToChapter(chapter.nextChapterId);
      } else if (event.key === "ArrowLeft") {
        goToChapter(chapter.prevChapterId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.mode, nextPage, previousPage, goToChapter, chapter.nextChapterId, chapter.prevChapterId]);

  function updatePrefs(next: ReaderPrefs) {
    setPrefs(next);
    savePrefs(next);
  }

  function toggleMode() {
    const mode = prefs.mode === "strip" ? "paged" : "strip";
    updatePrefs({ ...prefs, mode });
    if (mode === "strip") {
      requestAnimationFrame(() => imageRefs.current[page]?.scrollIntoView?.({ block: "start" }));
    }
  }

  const label = chapterLabel(chapter);
  const credit =
    chapter.groups.length > 0 ? `Translated by ${groupNames(chapter.groups)}` : "No translation group credited";
  const toolbarHidden = prefs.mode === "strip" && scrollingDown;
  const ready = pagesState.status === "ready" && total > 0;
  const showEnd = ready && (prefs.mode === "strip" || page === total - 1);

  return (
    <div className="min-h-dvh pb-6">
      <div
        className={`sticky top-14 z-30 border-b border-rule bg-ink/95 backdrop-blur transition-transform duration-200 ${
          toolbarHidden ? "-translate-y-full" : ""
        }`}
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <Link href={`/title/${manga.id}`} className="block truncate text-dusk hover:text-paper">
              {manga.title}
            </Link>
            <p className="truncate font-medium">{label}</p>
          </div>
          <nav aria-label="Chapter" className="flex items-center gap-2">
            {chapter.prevChapterId ? (
              <Link href={`/read/${chapter.prevChapterId}`} className={toolButton}>
                Previous chapter
              </Link>
            ) : null}
            {chapter.nextChapterId ? (
              <Link href={`/read/${chapter.nextChapterId}`} className={toolButton}>
                Next chapter
              </Link>
            ) : null}
          </nav>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleMode} aria-pressed={prefs.mode === "paged"} className={toolButton}>
              Page by page
            </button>
            <button
              type="button"
              onClick={() => updatePrefs({ ...prefs, dataSaver: !prefs.dataSaver })}
              aria-pressed={prefs.dataSaver}
              className={toolButton}
            >
              Data saver
            </button>
          </div>
        </div>
        <p className="mx-auto max-w-5xl truncate px-4 pb-2 text-xs text-dusk">{credit}. Hosted on MangaDex.</p>
      </div>

      {pagesState.status === "loading" && (
        <p role="status" className="py-24 text-center text-dusk">
          Loading pages
        </p>
      )}

      {pagesState.status === "error" && (
        <div role="alert" className="mx-auto max-w-md px-4 py-24 text-center">
          <p>{pagesState.message}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${primaryButton} mt-6`}>
            Try again
          </button>
        </div>
      )}

      {ready && prefs.mode === "strip" && (
        <div className="mx-auto max-w-[800px]">
          {pages.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element -- pages are served and cached by the image proxy
            <img
              key={src}
              ref={(el) => {
                imageRefs.current[index] = el;
              }}
              src={src}
              alt={`Page ${index + 1} of ${total}`}
              loading={index <= page + PRELOAD_AHEAD ? "eager" : "lazy"}
              decoding="async"
              onLoad={() => setLoadedPages((prev) => new Set(prev).add(index))}
              style={loadedPages.has(index) ? undefined : { minHeight: "60vh" }}
              className="block w-full bg-gutter"
            />
          ))}
        </div>
      )}

      {ready && prefs.mode === "paged" && (
        <div className="mx-auto max-w-[800px] px-2 py-4">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- pages are served and cached by the image proxy */}
            <img
              src={pages[page]}
              alt={`Page ${page + 1} of ${total}`}
              className="mx-auto block max-h-[calc(100dvh-11rem)] w-auto"
            />
            <button
              type="button"
              aria-label="Previous page"
              onClick={previousPage}
              className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
            />
            <button
              type="button"
              aria-label="Next page"
              onClick={nextPage}
              className="absolute inset-y-0 right-0 w-2/3 cursor-e-resize"
            />
          </div>
          <p aria-live="polite" className="mt-3 text-center text-sm text-dusk">
            Page {page + 1} of {total}
          </p>
        </div>
      )}

      {showEnd && (
        <section className="mx-auto max-w-[800px] px-4 py-14 text-center">
          <p className="font-display text-3xl">End of {chapter.number ? `chapter ${chapter.number}` : "this chapter"}</p>
          <p className="mt-2 text-sm text-dusk">
            {chapter.groups.length > 0
              ? `${credit}. If you enjoyed it, follow the group on MangaDex.`
              : "Hosted on MangaDex."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {chapter.nextChapterId ? (
              <Link href={`/read/${chapter.nextChapterId}`} className={primaryButton}>
                Read the next chapter
              </Link>
            ) : (
              <p className="self-center text-dusk">You&apos;re caught up. New chapters show up on the title page.</p>
            )}
            <Link href={`/title/${manga.id}`} className={secondaryButton}>
              Back to the title
            </Link>
          </div>
        </section>
      )}

      <div aria-hidden className="fixed inset-x-0 bottom-0 z-30 h-1 bg-rule">
        <div className="h-full bg-marker transition-[width] duration-150" style={{ width: `${progressPercent(page, total)}%` }} />
      </div>
    </div>
  );
}
