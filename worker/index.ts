import { createClient } from '@supabase/supabase-js'
import { processJob } from './process-job.js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const POLL_INTERVAL = 30_000 // 30 seconds

const APP_BASE_URL = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
const CRON_SECRET = process.env.CRON_SECRET

/**
 * Fire the Next.js job-complete webhook so the application side can run
 * eager post-processing (e.g. `project-enrichment` on a finished scan)
 * without waiting for a nightly sweep. Non-fatal: if the webhook call fails
 * or env is missing, the nightly crons still pick the state up.
 */
async function notifyJobComplete(jobId: string) {
  if (!APP_BASE_URL || !CRON_SECRET) {
    return
  }
  try {
    const res = await fetch(`${APP_BASE_URL.replace(/\/$/, '')}/api/webhooks/job-complete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ jobId }),
    })
    if (!res.ok) {
      console.warn(`[worker] job-complete webhook responded ${res.status} for job ${jobId}`)
    }
  } catch (err) {
    console.warn(`[worker] job-complete webhook failed for job ${jobId}:`, err)
  }
}

async function pollForJobs() {
  // Reset stale running jobs (worker crashed before updating status)
  // Must exceed the 30min Claude Code timeout to avoid resetting active jobs
  const thirtyFiveMinAgo = new Date(Date.now() - 35 * 60 * 1000).toISOString()
  await supabase
    .from('build_jobs')
    .update({ status: 'pending', error: null, started_at: null })
    .eq('status', 'running')
    .lt('started_at', thirtyFiveMinAgo)

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

    // Notify the Next.js app so it can run eager post-processing
    // (project-enrichment, etc.). Non-fatal.
    await notifyJobComplete(job.id)
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
