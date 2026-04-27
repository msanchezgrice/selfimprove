import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserOrg } from '@/lib/supabase/auth-helpers'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { redirect } from 'next/navigation'
import type { BrainPageRow, Tier } from '@/lib/types/database'
import { FocusPicker } from '@/app/brain-v1/runtime/_components/focus-picker'
import { SettingsForm } from '../../_components/settings-form'

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

  const admin = createAdminClient()
  const { data: focusRow } = await admin
    .from('brain_pages')
    .select('slug, updated_at')
    .eq('project_id', project.id)
    .eq('kind', 'current_focus')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const focusSlug = ((focusRow as Pick<BrainPageRow, 'slug' | 'updated_at'> | null)?.slug) ?? null

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
        Settings
      </h1>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: '#8b5e34' }}>
            Project Brain — current focus
          </h2>
          <Link
            href="/brain-v1/runtime"
            className="text-xs underline underline-offset-4"
            style={{ color: '#8b5e34' }}
          >
            open live runtime dashboard
          </Link>
        </div>
        <FocusPicker projectId={project.id} currentFocus={focusSlug} note={null} />
      </section>

      <SettingsForm
        project={project}
        settings={settings}
        orgTier={orgTier}
      />
    </div>
  )
}
