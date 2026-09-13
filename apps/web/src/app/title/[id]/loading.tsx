const block = "motion-safe:animate-pulse bg-gutter rounded-sm";

export default function Loading() {
  return (
    <div role="status" className="mx-auto max-w-6xl px-4 py-8">
      <span className="sr-only">Loading title</span>
      <div aria-hidden className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <div className={`mx-auto aspect-[3/4] w-48 md:w-full ${block}`} />
        <div className="min-w-0">
          <div className={`h-10 w-3/4 ${block}`} />
          <div className={`mt-3 h-4 w-1/3 ${block}`} />
          <div className={`mt-6 h-10 w-40 ${block}`} />
          <div className="mt-8 space-y-2">
            <div className={`h-4 w-full ${block}`} />
            <div className={`h-4 w-full ${block}`} />
            <div className={`h-4 w-2/3 ${block}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
