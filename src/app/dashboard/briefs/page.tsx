export default function BriefsPage() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <div className="flex flex-col items-center justify-center h-full min-h-64">
          {/* Scroll icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-4"
          >
            <path
              d="M14 8H34C36.2 8 38 9.8 38 12V36C38 38.2 36.2 40 34 40H18C15.8 40 14 38.2 14 36V8Z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14 8C14 8 10 8 10 12C10 16 14 16 14 16"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 18H32"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M20 24H28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            First brief coming soon
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Briefs are generated from your signals and roadmap
          </p>
        </div>
      </div>
    </div>
  )
}
