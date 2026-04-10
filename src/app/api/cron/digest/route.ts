import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDailyDigest, sendConnectReminder } from '@/lib/notifications'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all orgs
  const { data: orgs } = await supabase
    .from('orgs')
    .select('id')

  if (!orgs) return NextResponse.json({ sent: 0 })

  let digestsSent = 0
  let remindersSent = 0

  for (const org of orgs) {
    // Send daily digest
    try {
      await sendDailyDigest(org.id)
      digestsSent++
    } catch { /* skip on error */ }

    // Check for incomplete setup and send reminders
    const { data: projects } = await supabase
      .from('projects')
      .select('id, repo_url, org_id')
      .eq('org_id', org.id)

    if (!projects || projects.length === 0) continue

    for (const project of projects) {
      const { data: settings } = await supabase
        .from('project_settings')
        .select('widget_enabled, posthog_api_key, sentry_dsn')
        .eq('project_id', project.id)
        .single()

      const missing: string[] = []
      if (!project.repo_url) missing.push('repo')
      if (!settings?.widget_enabled) missing.push('widget')
      if (!settings?.posthog_api_key) missing.push('posthog')
      if (!settings?.sentry_dsn) missing.push('sentry')

      // Only send reminders if project is >3 days old and still missing things
      const { data: projectData } = await supabase
        .from('projects')
        .select('created_at')
        .eq('id', project.id)
        .single()

      if (projectData) {
        const daysSinceCreation = (Date.now() - new Date(projectData.created_at).getTime()) / (1000 * 60 * 60 * 24)
        if (daysSinceCreation > 3 && missing.length > 0) {
          const { data: members } = await supabase
            .from('org_members')
            .select('user_id')
            .eq('org_id', org.id)
            .eq('role', 'owner')
            .limit(1)
            .single()

          if (members) {
            await sendConnectReminder(members.user_id, org.id, missing).catch(() => {})
            remindersSent++
          }
        }
      }
    }
  }

  return NextResponse.json({ digestsSent, remindersSent })
}
