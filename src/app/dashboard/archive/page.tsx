import { TabNavigation } from '../_components/tab-navigation'

export default function ArchivePage() {
  return (
    <div className="flex flex-col h-full">
      <TabNavigation />

      <div className="flex-1 p-6">
        <div className="flex flex-col items-center justify-center h-full min-h-64">
          {/* Cabinet / archive icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-4"
          >
            <rect
              x="8"
              y="8"
              width="32"
              height="12"
              rx="2"
              stroke="#6366f1"
              strokeWidth="1.5"
            />
            <rect
              x="8"
              y="24"
              width="32"
              height="12"
              rx="2"
              stroke="#6366f1"
              strokeWidth="1.5"
            />
            <path
              d="M20 14H28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M20 30H28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 40H40"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing archived yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Archived features are kept here for reference
          </p>
        </div>
      </div>
    </div>
  )
}
