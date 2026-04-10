import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

let _resend: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://selfimprove-iota.vercel.app'
const FROM = 'SelfImprove <notifications@selfimprove.dev>'

function emailTemplate(content: string): string {
  return `
    <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #1a1a2e;">
      <div style="margin-bottom: 24px;">
        <span style="font-size: 18px; font-weight: 700;">Self</span><span style="font-size: 18px; font-weight: 700; color: #6366f1;">Improve</span>
      </div>
      ${content}
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e8e4de;">
        <p style="color: #8b8680; font-size: 12px;">
          <a href="${APP_URL}/dashboard" style="color: #6366f1; text-decoration: none;">Open Dashboard</a> ·
          <a href="${APP_URL}" style="color: #8b8680; text-decoration: none;">SelfImprove</a>
        </p>
      </div>
    </div>
  `
}

async function getOrgEmails(orgId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data: members } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', orgId)

  if (!members) return []

  const emails: string[] = []
  for (const m of members) {
    const { data } = await supabase.auth.admin.getUserById(m.user_id)
    if (data?.user?.email) emails.push(data.user.email)
  }
  return emails
}

// === Welcome Email ===
export async function sendWelcomeEmail(userId: string, orgId: string) {
  const resend = getResend()
  if (!resend) return

  const supabase = createAdminClient()
  const { data } = await supabase.auth.admin.getUserById(userId)
  if (!data?.user?.email) return

  const name = data.user.user_metadata?.full_name || data.user.email.split('@')[0]

  await resend.emails.send({
    from: FROM,
    to: data.user.email,
    subject: 'Welcome to SelfImprove',
    html: emailTemplate(`
      <h2 style="font-size: 20px; margin: 0 0 8px;">Welcome, ${name}!</h2>
      <p style="color: #8b8680; font-size: 15px; line-height: 1.6;">
        Your AI Product Manager is ready. Here's what happens next:
      </p>
      <div style="margin: 20px 0; padding: 16px; background: #f5f0eb; border-radius: 10px;">
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>1. Connect your repo</strong> — we'll scan it for initial insights</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>2. Install the widget</strong> — one line of code to collect feedback</p>
        <p style="margin: 0 0 8px; font-size: 14px;"><strong>3. Get your roadmap</strong> — AI generates prioritized improvements</p>
        <p style="margin: 0; font-size: 14px;"><strong>4. Ship</strong> — approve items and they get auto-implemented</p>
      </div>
      <a href="${APP_URL}/onboarding" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Get Started</a>
    `),
  }).catch(err => console.error('[email] Welcome failed:', err))
}

// === Roadmap Ready Email ===
export async function sendRoadmapReadyEmail(projectId: string, itemCount: number) {
  const resend = getResend()
  if (!resend) return

  const supabase = createAdminClient()
  const { data: project } = await supabase
    .from('projects')
    .select('name, org_id')
    .eq('id', projectId)
    .single()
  if (!project) return

  const emails = await getOrgEmails(project.org_id)
  if (emails.length === 0) return

  await resend.emails.send({
    from: FROM,
    to: emails,
    subject: `${project.name}: ${itemCount} new roadmap items`,
    html: emailTemplate(`
      <h2 style="font-size: 20px; margin: 0 0 8px;">${itemCount} new roadmap items for ${project.name}</h2>
      <p style="color: #8b8680; font-size: 15px; line-height: 1.6;">
        Your AI PM analyzed recent signals and generated ${itemCount} new improvement${itemCount === 1 ? '' : 's'}.
      </p>
      <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Roadmap</a>
    `),
  }).catch(err => console.error('[email] Roadmap ready failed:', err))
}

// === Daily Digest Email ===
export async function sendDailyDigest(orgId: string) {
  const resend = getResend()
  if (!resend) return

  const supabase = createAdminClient()
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Get org projects
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('org_id', orgId)

  if (!projects || projects.length === 0) return

  const projectIds = projects.map(p => p.id)

  // Get new signals
  const { count: newSignalCount } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .in('project_id', projectIds)
    .gte('created_at', oneDayAgo)

  // Get new roadmap items
  const { data: newItems } = await supabase
    .from('roadmap_items')
    .select('title, category, roi_score, status, project_id')
    .in('project_id', projectIds)
    .gte('created_at', oneDayAgo)

  // Get status changes (approved, shipped, building)
  const { data: statusChanges } = await supabase
    .from('roadmap_items')
    .select('title, status, build_status, pr_url')
    .in('project_id', projectIds)
    .gte('updated_at', oneDayAgo)
    .in('status', ['approved', 'shipped', 'building'])

  // Get completed build jobs
  const { data: completedJobs } = await supabase
    .from('build_jobs')
    .select('job_type, result, project_id')
    .in('project_id', projectIds)
    .eq('status', 'completed')
    .gte('completed_at', oneDayAgo)

  // If nothing happened, don't send
  const totalActivity = (newSignalCount || 0) + (newItems?.length || 0) + (statusChanges?.length || 0) + (completedJobs?.length || 0)
  if (totalActivity === 0) return

  // Build digest HTML
  let digestHtml = `<h2 style="font-size: 20px; margin: 0 0 16px;">Daily Digest</h2>`

  if (newSignalCount && newSignalCount > 0) {
    digestHtml += `<div style="margin-bottom: 16px; padding: 12px; background: #f5f0eb; border-radius: 8px;">
      <p style="margin: 0; font-size: 14px;"><strong>${newSignalCount} new signal${newSignalCount === 1 ? '' : 's'}</strong> received in the last 24 hours</p>
    </div>`
  }

  if (newItems && newItems.length > 0) {
    digestHtml += `<div style="margin-bottom: 16px;">
      <p style="font-size: 13px; color: #8b8680; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">New Roadmap Items</p>`
    for (const item of newItems.slice(0, 5)) {
      digestHtml += `<div style="padding: 8px 0; border-bottom: 1px solid #e8e4de; font-size: 14px;">
        <strong>${item.title}</strong>
        <span style="color: #8b8680; font-size: 12px; margin-left: 8px;">ROI: ${item.roi_score}</span>
      </div>`
    }
    if (newItems.length > 5) {
      digestHtml += `<p style="font-size: 12px; color: #8b8680;">+${newItems.length - 5} more</p>`
    }
    digestHtml += `</div>`
  }

  if (statusChanges && statusChanges.length > 0) {
    const shipped = statusChanges.filter(s => s.status === 'shipped')
    const approved = statusChanges.filter(s => s.status === 'approved')

    if (shipped.length > 0) {
      digestHtml += `<div style="margin-bottom: 16px; padding: 12px; background: #ecfdf5; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #059669;"><strong>${shipped.length} item${shipped.length === 1 ? '' : 's'} shipped!</strong></p>
        ${shipped.map(s => `<p style="margin: 4px 0 0; font-size: 13px;">${s.title}${s.pr_url ? ` — <a href="${s.pr_url}" style="color: #6366f1;">PR</a>` : ''}</p>`).join('')}
      </div>`
    }

    if (approved.length > 0) {
      digestHtml += `<div style="margin-bottom: 16px; padding: 12px; background: #eef2ff; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #6366f1;"><strong>${approved.length} item${approved.length === 1 ? '' : 's'} approved</strong></p>
      </div>`
    }
  }

  digestHtml += `<a href="${APP_URL}/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Open Dashboard</a>`

  const emails = await getOrgEmails(orgId)
  if (emails.length === 0) return

  await resend.emails.send({
    from: FROM,
    to: emails,
    subject: `SelfImprove Digest: ${totalActivity} update${totalActivity === 1 ? '' : 's'} today`,
    html: emailTemplate(digestHtml),
  }).catch(err => console.error('[email] Digest failed:', err))
}

// === Connect Reminder ===
export async function sendConnectReminder(userId: string, orgId: string, missing: string[]) {
  const resend = getResend()
  if (!resend) return

  const supabase = createAdminClient()
  const { data } = await supabase.auth.admin.getUserById(userId)
  if (!data?.user?.email) return

  const name = data.user.user_metadata?.full_name || 'there'

  const missingHtml = missing.map(m => {
    switch (m) {
      case 'repo': return '<li>Connect a GitHub repository</li>'
      case 'widget': return '<li>Install the feedback widget on your site</li>'
      case 'posthog': return '<li>Connect PostHog for analytics signals</li>'
      case 'sentry': return '<li>Connect Sentry for error tracking</li>'
      default: return ''
    }
  }).join('')

  await resend.emails.send({
    from: FROM,
    to: data.user.email,
    subject: 'Complete your SelfImprove setup',
    html: emailTemplate(`
      <h2 style="font-size: 20px; margin: 0 0 8px;">Hey ${name}, you're almost there!</h2>
      <p style="color: #8b8680; font-size: 15px; line-height: 1.6;">
        Complete these steps to get the most out of your AI PM:
      </p>
      <ul style="padding-left: 20px; font-size: 14px; line-height: 2;">
        ${missingHtml}
      </ul>
      <a href="${APP_URL}/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">Complete Setup</a>
    `),
  }).catch(err => console.error('[email] Reminder failed:', err))
}

// Keep backward-compatible exports
export function notifyRoadmapReady(projectId: string, itemCount: number) {
  return sendRoadmapReadyEmail(projectId, itemCount)
}

export function notifyPRCreated(projectId: string, prUrl: string, itemTitle: string) {
  // PRs are included in the daily digest, no individual email
  console.log(`[notification] PR created: ${itemTitle} — ${prUrl}`)
  return Promise.resolve()
}

export function notifyTierChanged(projectId: string, oldTier: string, newTier: string) {
  // Tier changes are included in the daily digest
  console.log(`[notification] Tier changed: ${oldTier} → ${newTier}`)
  return Promise.resolve()
}
