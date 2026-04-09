import { createClient } from '@/lib/supabase/server'
import { RoadmapTable } from '../../_components/roadmap-table'

export default async function BuildingPage() {
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
        .in('status', ['approved', 'building'])
        .order('rank', { ascending: true })
    : { data: null }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Building
          </h1>
          <p className="text-sm" style={{ color: '#8b8680' }}>
            {items?.length ?? 0} items
          </p>
        </div>
      </div>

      {!items || items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-xl border bg-white px-6 py-16 text-center"
          style={{ borderColor: '#e8e4de' }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="mb-4"
          >
            <path
              d="M14 34L28.5 19.5M34 14C34 14 36 12 34 10C32 8 30 10 30 10L20 20C20 20 16 18 12 22C8 26 12 32 12 32L16 36C16 36 22 40 26 36C30 32 28 28 28 28L38 18C38 18 40 16 38 14C36 12 34 14 34 14Z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing building yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Move features to &quot;Building&quot; when you start work
          </p>
        </div>
      ) : (
        <RoadmapTable items={items} />
      )}
    </div>
  )
}
