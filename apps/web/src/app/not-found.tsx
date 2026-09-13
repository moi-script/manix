import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <h1 className="font-display text-4xl">That title or chapter isn&apos;t here</h1>
      <p className="mt-3 text-dusk">It may have been removed from MangaDex, or the link is wrong.</p>
      <Link href="/search" className="mt-6 inline-block rounded-sm bg-marker px-5 py-2.5 font-medium text-ink">
        Browse manhwa
      </Link>
    </div>
  );
}
