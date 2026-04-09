import { createClient } from '@/lib/supabase/server'
import { RoadmapTable } from '../_components/roadmap-table'

export default async function ArchivePage() {
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
        .in('status', ['archived', 'dismissed'])
        .order('rank', { ascending: true })
    : { data: null }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Archive
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
            <rect
              x="8"
              y="8"
              width="32"
              height="12"
              rx="2"
              stroke="#6366f1"
              strokeWidth="1.5"
            />
            <rect
              x="8"
              y="24"
              width="32"
              height="12"
              rx="2"
              stroke="#6366f1"
              strokeWidth="1.5"
            />
            <path
              d="M20 14H28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M20 30H28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8 40H40"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing archived yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Archived features are kept here for reference
          </p>
        </div>
      ) : (
        <RoadmapTable items={items} />
      )}
    </div>
  )
}
