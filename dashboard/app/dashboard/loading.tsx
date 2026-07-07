export default function DashboardLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="h-8 w-44 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-4 w-56 rounded mt-2 animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-9 w-36 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
          <div className="h-9 w-9 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        </div>
      </div>

      {/* Tab row skeleton */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[90, 110, 100, 120, 95].map((w, i) => (
          <div
            key={i}
            className="h-7 rounded-full animate-pulse"
            style={{ width: w, background: "var(--bg-elevated)" }}
          />
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl overflow-hidden border"
            style={{ background: "var(--bg-surface)", borderColor: "var(--bdr)" }}
          >
            <div className="h-1.5 w-full animate-pulse" style={{ background: "var(--bg-elevated)" }} />
            <div className="px-5 pt-4 pb-5 space-y-3">
              <div className="h-3 w-24 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              <div className="h-4 w-4/5 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              <div className="h-3 w-3/5 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-full rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                <div className="h-3 w-11/12 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
                <div className="h-3 w-4/5 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
