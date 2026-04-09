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

  // For now, log to console — extend to email/webhook later
  console.log(`[NOTIFICATION] ${payload.type}: ${payload.title}`, {
    project: project.name,
    recipients: members.length,
  })

  // Store in a simple format that can be queried by the dashboard
  // We'll use the signals table with type 'builder' for now,
  // or create a dedicated notifications approach later.
  // For MVP, just return the payload for the caller to use.
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
