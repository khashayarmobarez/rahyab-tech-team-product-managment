/** Shown while the page loads. It is part of the static shell, so it appears at once. */
export function PageSkeleton() {
  const block = "animate-pulse rounded-2xl bg-muted";
  return (
    <div aria-busy="true" aria-label="Loading reports" role="status">
      <div className="h-[3.25rem] border-b bg-background" />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6">
        <div className={`${block} h-64`} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className={`${block} h-80`} />
          <div className={`${block} h-80`} />
          <div className={`${block} h-80`} />
        </div>
        <div className={`${block} h-40`} />
        <span className="sr-only">Loading reports…</span>
      </div>
    </div>
  );
}
