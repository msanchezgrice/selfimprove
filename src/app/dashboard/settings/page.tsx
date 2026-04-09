import { createClient } from '@/lib/supabase/server'
import { getUserOrg } from '@/lib/supabase/auth-helpers'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { redirect } from 'next/navigation'
import type { Tier } from '@/lib/types/database'
import { SettingsForm } from '../_components/settings-form'

export default async function SettingsPage() {
  const userOrg = await getUserOrg()
  if (!userOrg) redirect('/login')

  const supabase = await createClient()

  const project = await getActiveProject()

  if (!project) {
    return (
      <div>
        <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
          Settings
        </h1>
        <p className="mt-2" style={{ color: '#8b8680' }}>
          Create a project first to configure settings.
        </p>
      </div>
    )
  }

  const { data: settings } = await supabase
    .from('project_settings')
    .select('*')
    .eq('project_id', project.id)
    .single()

  if (!settings) redirect('/dashboard')

  const org = userOrg.org as { tier?: Tier } | null
  const orgTier: Tier = org?.tier ?? 'free'

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-semibold mb-6" style={{ color: '#1a1a2e' }}>
        Settings
      </h1>
      <SettingsForm
        project={project}
        settings={settings}
        orgTier={orgTier}
      />
    </div>
  )
}
