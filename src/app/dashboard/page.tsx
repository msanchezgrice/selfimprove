import { redirect } from 'next/navigation'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; billing?: string }>
}) {
  const { upgrade } = await searchParams
  if (upgrade === 'pro' || upgrade === 'autonomous') {
    redirect(`/dashboard/settings?tab=billing&upgrade=${upgrade}`)
  }
  redirect('/dashboard/roadmap')
}
