export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div
      className="rounded-xl border bg-white overflow-hidden"
      style={{ borderColor: '#e8e4de' }}
    >
      {/* Header skeleton */}
      <div
        className="flex gap-4 px-3 py-3"
        style={{ backgroundColor: '#faf8f5' }}
      >
        {[28, 140, 72, 96, 48, 48].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded animate-pulse"
            style={{ width: w, backgroundColor: '#e8e4de' }}
          />
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-t px-3 py-4"
          style={{ borderColor: '#e8e4de' }}
        >
          {/* Rank */}
          <div
            className="h-4 w-6 rounded animate-pulse"
            style={{ backgroundColor: '#e8e4de' }}
          />
          {/* Title + description */}
          <div className="flex-1 space-y-1.5">
            <div
              className="h-4 rounded animate-pulse"
              style={{
                width: `${55 + ((i * 17) % 30)}%`,
                backgroundColor: '#e8e4de',
              }}
            />
            <div
              className="h-3 rounded animate-pulse"
              style={{
                width: `${35 + ((i * 13) % 25)}%`,
                backgroundColor: '#f0ece6',
              }}
            />
          </div>
          {/* Category badge */}
          <div
            className="h-5 w-16 rounded-md animate-pulse"
            style={{ backgroundColor: '#f0ece6' }}
          />
          {/* Confidence bar */}
          <div
            className="h-1.5 w-16 rounded-full animate-pulse"
            style={{ backgroundColor: '#e8e4de' }}
          />
          {/* ROI */}
          <div
            className="h-5 w-10 rounded-md animate-pulse"
            style={{ backgroundColor: '#f0ece6' }}
          />
        </div>
      ))}
    </div>
  )
}
