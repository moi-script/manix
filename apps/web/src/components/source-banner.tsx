"use client";

import { useEffect, useState } from "react";

export function SourceBanner() {
  const [sourceDown, setSourceDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((res) => (res.ok ? (res.json() as Promise<{ sourceAvailable?: boolean }>) : { sourceAvailable: false }))
      .then((body) => {
        if (!cancelled) setSourceDown(body.sourceAvailable === false);
      })
      .catch(() => {
        if (!cancelled) setSourceDown(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sourceDown) return null;

  return (
    <div role="status" className="border-b border-signal/40 bg-signal/10 px-4 py-2 text-center text-sm text-paper">
      MangaDex isn&apos;t responding. Titles you opened recently still load, but new chapters may not open until it&apos;s back.
    </div>
  );
}
