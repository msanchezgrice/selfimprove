import { redirect } from 'next/navigation'
import { getUserOrg } from '@/lib/supabase/auth-helpers'
import { OnboardingWizard } from './_components/wizard'

export default async function OnboardingPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) redirect('/login')

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: '#faf8f5' }}
    >
      <OnboardingWizard orgId={userOrg.orgId} />
    </div>
  )
}
