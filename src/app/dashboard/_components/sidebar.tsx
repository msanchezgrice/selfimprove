'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Compass, Radio, Settings, LogOut, ChevronDown, Plus, Menu, X } from 'lucide-react'

type SidebarUser = {
  id: string
  email?: string
}

type DashboardSidebarProps = {
  user: SidebarUser
  orgName: string
}

const navItems = [
  { href: '/dashboard/roadmap', label: 'Roadmap', icon: Compass },
  { href: '/dashboard/signals', label: 'Signals', icon: Radio },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

function getInitials(email: string | undefined): string {
  if (!email) return '?'
  const name = email.split('@')[0]
  const parts = name.split(/[._-]/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export function DashboardSidebar({ user, orgName }: DashboardSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [projects, setProjects] = useState<Array<{ id: string; name: string; framework: string | null }>>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [showProjectPicker, setShowProjectPicker] = useState(false)
  const projectPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/projects/list')
      .then(r => r.json())
      .then(data => {
        setProjects(data.projects || [])
        const saved = document.cookie.match(/selfimprove_project=([^;]+)/)?.[1]
        if (saved && data.projects?.some((p: { id: string }) => p.id === saved)) {
          setSelectedProjectId(saved)
        } else if (data.projects?.length > 0) {
          setSelectedProjectId(data.projects[0].id)
          document.cookie = `selfimprove_project=${data.projects[0].id};path=/;max-age=31536000`
        }
      })
      .catch(() => {})
  }, [])

  // Close project picker on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (projectPickerRef.current && !projectPickerRef.current.contains(e.target as Node)) {
        setShowProjectPicker(false)
      }
    }
    if (showProjectPicker) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showProjectPicker])

  const switchProject = (id: string) => {
    setSelectedProjectId(id)
    document.cookie = `selfimprove_project=${id};path=/;max-age=31536000`
    setShowProjectPicker(false)
    router.refresh()
  }

  return (
    <>
      {/* Mobile overlay */}
      <aside
        className="
          hidden md:flex flex-col w-60 border-r bg-white shrink-0
        "
        style={{ borderColor: '#e8e4de' }}
      >
        {/* Logo & org */}
        <div className="px-5 pt-5 pb-4">
          <div
            className="text-lg font-semibold tracking-tight"
            style={{ color: '#1a1a2e' }}
          >
            SelfImprove
          </div>
          <div
            className="mt-1 text-xs font-medium truncate"
            style={{ color: '#8b8680' }}
          >
            {orgName}
          </div>
        </div>

        {/* Project selector */}
        <div className="relative px-3 mb-4" ref={projectPickerRef}>
          <button
            onClick={() => setShowProjectPicker(!showProjectPicker)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ color: '#1a1a2e', backgroundColor: showProjectPicker ? '#f5f0eb' : 'transparent' }}
          >
            <span className="truncate">
              {projects.find(p => p.id === selectedProjectId)?.name || 'Select project'}
            </span>
            <ChevronDown size={14} style={{ color: '#8b8680' }} />
          </button>

          {showProjectPicker && (
            <div
              className="absolute left-3 right-3 mt-1 rounded-lg border bg-white shadow-lg z-50 overflow-hidden"
              style={{ borderColor: '#e8e4de' }}
            >
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => switchProject(p.id)}
                  className="w-full flex items-center px-3 py-2 text-sm text-left transition-colors hover:bg-[#f5f0eb]"
                  style={{
                    color: p.id === selectedProjectId ? '#6366f1' : '#1a1a2e',
                    backgroundColor: p.id === selectedProjectId ? '#eef2ff' : undefined,
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  {p.framework && (
                    <span className="ml-auto text-xs" style={{ color: '#8b8680' }}>{p.framework}</span>
                  )}
                </button>
              ))}
              <Link
                href="/onboarding"
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium border-t"
                style={{ color: '#6366f1', borderColor: '#e8e4de' }}
              >
                <Plus size={14} />
                Add new project
              </Link>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/')
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                  transition-colors duration-150
                  ${
                    isActive
                      ? 'text-indigo-600'
                      : 'hover:bg-gray-50'
                  }
                `}
                style={{
                  backgroundColor: isActive ? '#eef2ff' : undefined,
                  color: isActive ? '#6366f1' : '#1a1a2e',
                }}
              >
                <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User section */}
        <div
          className="px-3 py-4 border-t"
          style={{ borderColor: '#e8e4de' }}
        >
          <div className="flex items-center gap-3 px-2">
            {/* Avatar */}
            <div
              className="
                flex items-center justify-center w-8 h-8 rounded-full
                text-xs font-semibold text-white shrink-0
              "
              style={{ backgroundColor: '#6366f1' }}
            >
              {getInitials(user.email)}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-sm font-medium truncate"
                style={{ color: '#1a1a2e' }}
              >
                {user.email ?? 'User'}
              </div>
            </div>
          </div>
          <form action="/auth/signout" method="POST" className="mt-3">
            <button
              type="submit"
              className="
                flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm
                font-medium transition-colors duration-150 hover:bg-gray-50
                cursor-pointer
              "
              style={{ color: '#8b8680' }}
            >
              <LogOut size={16} strokeWidth={1.5} />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div
        className="
          flex md:hidden items-center justify-between px-4 py-3
          border-b bg-white fixed top-0 left-0 right-0 z-50
        "
        style={{ borderColor: '#e8e4de' }}
      >
        <div
          className="text-lg font-semibold tracking-tight"
          style={{ color: '#1a1a2e' }}
        >
          SelfImprove
        </div>
        <MobileMenu user={user} orgName={orgName} pathname={pathname} />
      </div>
    </>
  )
}

/* ---------- Mobile dropdown ---------- */

function MobileMenu({
  user,
  orgName,
  pathname,
}: {
  user: SidebarUser
  orgName: string
  pathname: string
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Close on route change
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-lg hover:bg-gray-50"
        style={{ color: '#1a1a2e' }}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full mt-2 w-64 bg-white rounded-xl
            border shadow-lg py-2 z-50
          "
          style={{ borderColor: '#e8e4de' }}
        >
          <div className="px-4 py-2">
            <div className="text-xs font-medium" style={{ color: '#8b8680' }}>
              {orgName}
            </div>
          </div>

          <div className="px-2 py-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(item.href + '/')
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                    transition-colors duration-150
                    ${isActive ? '' : 'hover:bg-gray-50'}
                  `}
                  style={{
                    backgroundColor: isActive ? '#eef2ff' : undefined,
                    color: isActive ? '#6366f1' : '#1a1a2e',
                  }}
                >
                  <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                  {item.label}
                </Link>
              )
            })}
          </div>

          <div className="border-t mx-2 my-1" style={{ borderColor: '#e8e4de' }} />

          <div className="px-4 py-2 flex items-center gap-3">
            <div
              className="
                flex items-center justify-center w-7 h-7 rounded-full
                text-xs font-semibold text-white shrink-0
              "
              style={{ backgroundColor: '#6366f1' }}
            >
              {getInitials(user.email)}
            </div>
            <div
              className="text-sm truncate"
              style={{ color: '#1a1a2e' }}
            >
              {user.email ?? 'User'}
            </div>
          </div>

          <div className="px-2">
            <form action="/auth/signout" method="POST">
              <button
                type="submit"
                className="
                  flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm
                  font-medium transition-colors duration-150 hover:bg-gray-50
                  cursor-pointer
                "
                style={{ color: '#8b8680' }}
              >
                <LogOut size={16} strokeWidth={1.5} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
