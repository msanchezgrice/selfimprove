import { redirect } from 'next/navigation'
import { getActiveProject } from '@/lib/supabase/get-active-project'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; billing?: string }>
}) {
  const { upgrade } = await searchParams
  const project = await getActiveProject()

  if (!project) redirect('/onboarding')

  if (upgrade === 'pro' || upgrade === 'autonomous') {
    redirect(`/dashboard/${project.slug}/settings?tab=billing&upgrade=${upgrade}`)
  }
  redirect(`/dashboard/${project.slug}/roadmap`)
}
