'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/dashboard/roadmap', label: 'Roadmap' },
  { href: '/dashboard/building', label: 'Building' },
  { href: '/dashboard/shipped', label: 'Shipped' },
  { href: '/dashboard/signals', label: 'Signals' },
  { href: '/dashboard/briefs', label: 'Briefs' },
  { href: '/dashboard/archive', label: 'Archive' },
]

export function TabNavigation() {
  const pathname = usePathname()

  return (
    <div
      className="border-b overflow-x-auto"
      style={{ borderColor: '#e8e4de' }}
    >
      <nav className="flex gap-0 min-w-max px-1" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(tab.href + '/')

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                relative px-4 py-3 text-sm font-medium whitespace-nowrap
                transition-colors duration-150
                ${isActive ? '' : 'hover:text-gray-700'}
              `}
              style={{
                color: isActive ? '#6366f1' : '#8b8680',
              }}
            >
              {tab.label}
              {isActive && (
                <span
                  className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full"
                  style={{ backgroundColor: '#6366f1' }}
                />
              )}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
