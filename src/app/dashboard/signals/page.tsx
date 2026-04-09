import { createClient } from '@/lib/supabase/server'
import { SignalsFeed } from '../_components/signals-feed'
import { SignalsEmpty } from '../_components/signals-empty'

export default async function SignalsPage() {
  const supabase = await createClient()

  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

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
