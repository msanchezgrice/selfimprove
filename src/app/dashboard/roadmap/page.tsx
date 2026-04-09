import { createClient } from '@/lib/supabase/server'
import { RoadmapTable } from '../_components/roadmap-table'
import { RoadmapEmpty } from '../_components/roadmap-empty'

export default async function RoadmapPage() {
  const supabase = await createClient()

  // Get user's first project
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .limit(1)
    .single()

  let projectId: string | null = null
  if (membership) {
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('org_id', membership.org_id)
      .limit(1)
      .single()
    projectId = project?.id ?? null
  }

  const { data: items } = projectId
    ? await supabase
        .from('roadmap_items')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['proposed', 'approved'])
        .order('rank', { ascending: true })
    : { data: null }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Roadmap
          </h1>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            {items?.length ?? 0} items
          </p>
        </div>
      </div>

      {!items || items.length === 0 ? (
        <RoadmapEmpty projectId={projectId} />
      ) : (
        <RoadmapTable items={items} />
      )}
    </div>
  )
}
