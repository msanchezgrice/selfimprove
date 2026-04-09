import { createClient } from '@/lib/supabase/server'
import { RoadmapTable } from '../../_components/roadmap-table'

export default async function ShippedPage() {
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
        .in('status', ['shipped'])
        .order('rank', { ascending: true })
    : { data: null }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
            Shipped
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
              d="M24 8C24 8 20 16 20 24C20 32 24 40 24 40C24 40 28 32 28 24C28 16 24 8 24 8Z"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 24L12 28L16 32L20 28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M28 24L36 28L32 32L28 28"
              stroke="#6366f1"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="24" cy="18" r="2" stroke="#6366f1" strokeWidth="1.5" />
          </svg>
          <h2
            className="font-semibold mb-2"
            style={{ fontSize: '1.2rem', color: '#1a1a2e' }}
          >
            Nothing shipped yet
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#8b8680' }}>
            Shipped features will appear here
          </p>
        </div>
      ) : (
        <RoadmapTable items={items} />
      )}
    </div>
  )
}
