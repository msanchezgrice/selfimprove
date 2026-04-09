import { createClient } from '@/lib/supabase/server'
import { getActiveProject } from '@/lib/supabase/get-active-project'
import { SignalsFeed } from '../_components/signals-feed'
import { SignalsEmpty } from '../_components/signals-empty'

export default async function SignalsPage() {
  const project = await getActiveProject()
  const supabase = await createClient()

  const { data: signals } = project
    ? await supabase
        .from('signals')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: null }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold" style={{ color: '#1a1a2e' }}>
          Signals
        </h1>
        <p className="text-sm" style={{ color: '#8b8680' }}>
          {signals?.length ?? 0} signals received
        </p>
      </div>

      {!signals || signals.length === 0 ? (
        <SignalsEmpty />
      ) : (
        <SignalsFeed signals={signals} />
      )}
    </div>
  )
}
