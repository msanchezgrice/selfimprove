import { createClient } from '@/lib/supabase/server'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { RoadmapTable } from '../../../_components/roadmap-table'
import { RoadmapEmpty } from '../../../_components/roadmap-empty'

export default async function RoadmapPage() {
  const project = await getActiveProject()
  const projectId = project?.id ?? null

  const supabase = await createClient()
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
