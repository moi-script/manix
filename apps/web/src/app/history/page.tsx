import type { Metadata } from "next";
import { HistoryView } from "@/components/history-view";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-5xl leading-none">History</h1>
      <div className="mt-6">
        <HistoryView />
      </div>
    </div>
  );
}
