import { redirect } from 'next/navigation'
import { getUserOrg } from '@/lib/supabase/auth-helpers'
import { DashboardSidebar } from './_components/sidebar'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const userOrg = await getUserOrg()
  if (!userOrg) redirect('/login')

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#faf8f5' }}>
      <DashboardSidebar
        user={userOrg.user}
        orgName={(userOrg.org as { name?: string } | null)?.name ?? 'My Team'}
      />
      {/* Mobile top-bar spacer */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">{children}</main>
    </div>
  )
}
