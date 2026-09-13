"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <h1 className="font-display text-4xl">This page didn&apos;t load</h1>
      <p className="mt-3 text-dusk">Manix couldn&apos;t reach its server or MangaDex. Try again, or come back in a minute.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-sm bg-marker px-5 py-2.5 font-medium text-ink">
        Try again
      </button>
    </div>
  );
}
