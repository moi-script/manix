import Link from "next/link";
import { UserMenu } from "@/components/user-menu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-ink/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="font-display text-2xl leading-none text-marker">
          manix
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm text-dusk">
          <Link href="/search" className="hover:text-paper">
            Browse
          </Link>
          <Link href="/library" className="hover:text-paper">
            Library
          </Link>
          <Link href="/history" className="hover:text-paper">
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
