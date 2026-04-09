import Link from 'next/link'

export function SignalsEmpty({ slug }: { slug: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center"
      style={{ borderColor: '#e8e4de' }}
    >
      {/* Radio tower icon */}
      <svg
        width={48}
        height={48}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-5"
        aria-hidden="true"
      >
        {/* Tower base */}
        <line x1="24" y1="28" x2="24" y2="44" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="44" x2="30" y2="44" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="36" x2="28" y2="36" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
        {/* Antenna tip */}
        <circle cx="24" cy="24" r="3" fill="#eef2ff" stroke="#6366f1" strokeWidth="1.5" />
        {/* Signal waves */}
        <path
          d="M17 19C14.8 21.2 14 23 14 24"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M31 19C33.2 21.2 34 23 34 24"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M12 14C8.4 17.6 6 21 6 24"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M36 14C39.6 17.6 42 21 42 24"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      <h2 className="text-lg font-semibold" style={{ color: '#1a1a2e' }}>
        Waiting for first signals...
      </h2>

      <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: '#8b8680' }}>
        Install the widget on your site or connect an integration to start
        receiving signals.
      </p>

      <Link
        href={`/dashboard/${slug}/settings`}
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#6366f1' }}
      >
        Check widget setup
        <span aria-hidden="true">&rarr;</span>
      </Link>
    </div>
  )
}
