import { createClient } from '@supabase/supabase-js'
import { processJob } from './process-job.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const POLL_INTERVAL = 30_000 // 30 seconds

async function pollForJobs() {
  // Reset stale running jobs (worker crashed before updating status)
  const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
  await supabase
    .from('build_jobs')
    .update({ status: 'pending', error: null, started_at: null })
    .eq('status', 'running')
    .lt('started_at', twentyMinAgo)

  // Grab the oldest pending job
  const { data: job } = await supabase
    .from('build_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single()

  if (!job) return

  console.log(`[worker] Processing job ${job.id} (${job.job_type}) for project ${job.project_id}`)

  // Mark as running
  await supabase
    .from('build_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)

  try {
    const result = await processJob(job)

    await supabase
      .from('build_jobs')
      .update({
        status: 'completed',
        result,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    console.log(`[worker] Job ${job.id} completed`)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[worker] Job ${job.id} failed:`, errorMsg)

    await supabase
      .from('build_jobs')
      .update({
        status: 'failed',
        error: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    // Reset roadmap item build_status on failure
    if (job.roadmap_item_id) {
      await supabase
        .from('roadmap_items')
        .update({ build_status: 'approved' })
        .eq('id', job.roadmap_item_id)
    }
  }
}

async function main() {
  console.log('[worker] Starting SelfImprove worker...')

  while (true) {
    try {
      await pollForJobs()
    } catch (err) {
      console.error('[worker] Poll error:', err)
    }
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
  }
}

main()
