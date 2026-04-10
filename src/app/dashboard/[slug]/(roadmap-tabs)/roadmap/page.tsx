import { createClient } from '@/lib/supabase/server'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { RoadmapTable } from '../../../_components/roadmap-table'
import { RoadmapEmpty } from '../../../_components/roadmap-empty'
import { GenerateButton } from '../../../_components/generate-button'

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

  // Count unprocessed signals
  const { count: unprocessedCount } = projectId
    ? await supabase
        .from('signals')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .eq('processed', false)
    : { count: 0 }

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
        {projectId && (
          <GenerateButton projectId={projectId} unprocessedCount={unprocessedCount ?? 0} />
        )}
      </div>

      {!items || items.length === 0 ? (
        <RoadmapEmpty projectId={projectId} />
      ) : (
        <RoadmapTable items={items} />
      )}
    </div>
  )
}
