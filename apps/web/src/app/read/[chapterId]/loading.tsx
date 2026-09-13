const block = "motion-safe:animate-pulse bg-gutter rounded-sm";

export default function Loading() {
  return (
    <div role="status" className="min-h-dvh pb-6">
      <span className="sr-only">Loading chapter</span>
      <div aria-hidden className="mx-auto max-w-5xl px-4 py-2">
        <div className={`h-4 w-1/3 ${block}`} />
        <div className={`mt-2 h-4 w-1/4 ${block}`} />
      </div>
      <div aria-hidden className="mx-auto max-w-[800px] px-2 py-4">
        <div className={`h-[70vh] w-full ${block}`} />
      </div>
    </div>
  );
}
