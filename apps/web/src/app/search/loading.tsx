const block = "motion-safe:animate-pulse bg-gutter rounded-sm";

export default function Loading() {
  return (
    <div role="status" className="mx-auto max-w-6xl px-4 py-8">
      <span className="sr-only">Loading results</span>
      <div aria-hidden>
        <div className={`h-10 w-40 ${block}`} />
        <div className={`mt-6 h-10 w-full ${block}`} />
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className={`aspect-[3/4] w-full ${block}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
