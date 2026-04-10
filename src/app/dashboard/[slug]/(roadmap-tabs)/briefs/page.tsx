import { createClient } from '@/lib/supabase/server'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { BriefsCards } from '../../../_components/briefs-cards'

export default async function BriefsPage() {
  const project = await getActiveProject()
  if (!project) return <div className="p-8"><p style={{ color: '#8b8680' }}>No project selected</p></div>

  const supabase = await createClient()
  const { data: items } = await supabase
    .from('roadmap_items')
    .select('*')
    .eq('project_id', project.id)
    .eq('stage', 'brief')
    .in('status', ['proposed'])
    .order('roi_score', { ascending: false })

  // Count roadmap items for cap display
  const { count: roadmapCount } = await supabase
    .from('roadmap_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', project.id)
    .eq('stage', 'roadmap')
    .in('status', ['proposed', 'approved', 'building'])

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>Briefs</h1>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            {items?.length ?? 0} ideas &middot; Roadmap: {roadmapCount ?? 0}/25
          </p>
        </div>
      </div>
      {!items || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center" style={{ borderColor: '#e8e4de' }}>
          <h2 className="text-lg font-semibold" style={{ color: '#1a1a2e' }}>No briefs yet</h2>
          <p className="mt-2 text-sm" style={{ color: '#8b8680' }}>Briefs are generated automatically from your signals.</p>
        </div>
      ) : (
        <BriefsCards items={items} roadmapCount={roadmapCount ?? 0} />
      )}
    </div>
  )
}
