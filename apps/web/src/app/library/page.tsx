import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";

export const metadata: Metadata = { title: "Library" };

export default function LibraryPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-5xl leading-none">Library</h1>
      <div className="mt-6">
        <LibraryView />
      </div>
    </div>
  );
}
