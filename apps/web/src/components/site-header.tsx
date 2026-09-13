import Link from "next/link";
import { UserMenu } from "@/components/user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="whitespace-nowrap font-display text-2xl leading-none text-marker">
          manix
        </Link>
        <nav aria-label="Main" className="flex items-center gap-3 text-sm text-dusk sm:gap-5">
          <Link href="/search" className="whitespace-nowrap hover:text-paper">
            Browse
          </Link>
          <Link href="/library" className="whitespace-nowrap hover:text-paper">
            Library
          </Link>
          <Link href="/history" className="hidden whitespace-nowrap hover:text-paper sm:inline">
            History
          </Link>
        </nav>
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
