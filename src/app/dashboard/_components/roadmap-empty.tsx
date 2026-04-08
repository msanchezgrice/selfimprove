import Link from 'next/link'

export function RoadmapEmpty() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center"
      style={{ borderColor: '#e8e4de' }}
    >
      {/* Compass icon */}
      <svg
        width={48}
        height={48}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#6366f1"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-5"
        aria-hidden="true"
      >
        <circle cx={12} cy={12} r={10} />
        <polygon
          points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
          fill="#eef2ff"
          stroke="#6366f1"
        />
      </svg>

      <h2 className="text-lg font-semibold" style={{ color: '#1a1a2e' }}>
        Your roadmap is brewing
      </h2>

      <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: '#8b8680' }}>
        Connect signals and your AI PM will generate prioritized improvements.
      </p>

      <Link
        href="/dashboard/signals"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#6366f1' }}
      >
        View initial analysis
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
