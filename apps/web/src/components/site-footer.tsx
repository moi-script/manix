import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-dusk sm:flex-row sm:items-center sm:justify-between">
        <p>
          Chapters and covers come from{" "}
          <a
            href="https://mangadex.org"
            target="_blank"
            rel="noreferrer"
            className="text-paper underline underline-offset-2"
          >
            MangaDex
          </a>{" "}
          and the scanlation groups credited on each chapter.
        </p>
        <Link href="/about" className="hover:text-paper">
          About and removal requests
        </Link>
      </div>
    </footer>
  );
}
