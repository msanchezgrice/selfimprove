import { TabNavigation } from '../_components/tab-navigation'

export default function ShippedPage() {
  return (
    <div className="flex flex-col h-full">
      <TabNavigation />

      <div className="flex-1 p-6">
        <div className="flex flex-col items-center justify-center h-full min-h-64">
          {/* Rocket icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-4"
          >
            <path
              d="M24 8C24 8 20 16 20 24C20 32 24 40 24 40C24 40 28 32 28 24C28 16 24 8 24 8Z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 24L12 28L16 32L20 28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M28 24L36 28L32 32L28 28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="18" r="2" stroke="#6366f1" strokeWidth="1.5" />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing shipped yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Shipped features will appear here
          </p>
        </div>
      </div>
    </div>
  )
}
