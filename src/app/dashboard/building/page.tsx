import { TabNavigation } from '../_components/tab-navigation'

export default function BuildingPage() {
  return (
    <div className="flex flex-col h-full">
      <TabNavigation />

      <div className="flex-1 p-6">
        <div className="flex flex-col items-center justify-center h-full min-h-64">
          {/* Wrench icon */}
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-4"
          >
            <path
              d="M14 34L28.5 19.5M34 14C34 14 36 12 34 10C32 8 30 10 30 10L20 20C20 20 16 18 12 22C8 26 12 32 12 32L16 36C16 36 22 40 26 36C30 32 28 28 28 28L38 18C38 18 40 16 38 14C36 12 34 14 34 14Z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing building yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Move features to &quot;Building&quot; when you start work
          </p>
        </div>
      </div>
    </div>
  )
}
