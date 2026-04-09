import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationType =
  | 'roadmap_ready'
  | 'prd_generated'
  | 'pr_created'
  | 'pr_approved'
  | 'pr_merged'
  | 'signal_milestone'
  | 'tier_upgraded'
  | 'tier_downgraded'

interface NotificationPayload {
  type: NotificationType
  projectId: string
  userId?: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}

let _resend: Resend | null = null
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

export async function createNotification(payload: NotificationPayload) {
  const supabase = createAdminClient()

  // Get project's org members to notify
  const { data: project } = await supabase
    .from('projects')
    .select('org_id, name')
    .eq('id', payload.projectId)
    .single()

  if (!project) return

  const { data: members } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', project.org_id)

  if (!members || members.length === 0) return

  console.log(`[NOTIFICATION] ${payload.type}: ${payload.title}`, {
    project: project.name,
    recipients: members.length,
  })

  // Send email via Resend if configured
  const resend = getResend()
  if (resend) {
    try {
      // Fetch member emails via admin auth API (auth.users is not queryable via supabase-js)
      const emails: string[] = []
      for (const member of members) {
        const { data } = await supabase.auth.admin.getUserById(member.user_id)
        if (data?.user?.email) emails.push(data.user.email)
      }

      if (emails.length > 0) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://selfimprove-iota.vercel.app'

        await resend.emails.send({
          from: 'SelfImprove <notifications@selfimprove.dev>',
          to: emails,
          subject: payload.title,
          html: `
            <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
              <div style="margin-bottom: 24px;">
                <span style="font-size: 18px; font-weight: 700; color: #1a1a2e;">Self</span><span style="font-size: 18px; font-weight: 700; color: #6366f1;">Improve</span>
              </div>
              <h2 style="font-size: 20px; color: #1a1a2e; margin: 0 0 8px;">${payload.title}</h2>
              <p style="color: #8b8680; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">${payload.body}</p>
              <a href="${appUrl}/dashboard" style="display: inline-block; padding: 10px 20px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">View Dashboard</a>
              <p style="color: #c4c0ba; font-size: 12px; margin-top: 32px;">SelfImprove — AI Product Manager for Developers</p>
            </div>
          `,
        })
      }
    } catch (err) {
      console.error('[NOTIFICATION] Failed to send email:', err)
    }
  }

  return {
    type: payload.type,
    title: payload.title,
    body: payload.body,
    recipientCount: members.length,
  }
}

// Convenience functions for common notifications
export function notifyRoadmapReady(projectId: string, itemCount: number) {
  return createNotification({
    type: 'roadmap_ready',
    projectId,
    title: 'New roadmap items generated',
    body: `Your AI PM generated ${itemCount} new roadmap item${itemCount === 1 ? '' : 's'} based on recent signals.`,
    metadata: { itemCount },
  })
}

export function notifyPRCreated(projectId: string, prUrl: string, itemTitle: string) {
  return createNotification({
    type: 'pr_created',
    projectId,
    title: `PR created: ${itemTitle}`,
    body: `A pull request has been created for "${itemTitle}". Review it at ${prUrl}`,
    metadata: { prUrl, itemTitle },
  })
}

export function notifyTierChanged(projectId: string, oldTier: string, newTier: string) {
  const isUpgrade = newTier !== 'free'
  return createNotification({
    type: isUpgrade ? 'tier_upgraded' : 'tier_downgraded',
    projectId,
    title: isUpgrade ? `Upgraded to ${newTier}` : `Downgraded to ${newTier}`,
    body: isUpgrade
      ? `Your plan has been upgraded from ${oldTier} to ${newTier}. New features are now available.`
      : `Your plan has been changed from ${oldTier} to ${newTier}.`,
    metadata: { oldTier, newTier },
  })
}
