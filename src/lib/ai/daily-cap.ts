import { createAdminClient } from '@/lib/supabase/admin'

export async function checkDailyCap(projectId: string, dailyCap: number): Promise<{ allowed: boolean; used: number; remaining: number }> {
  const supabase = createAdminClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('shipped_changes')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .gte('created_at', today.toISOString())

  const used = count ?? 0
  return {
    allowed: used < dailyCap,
    used,
    remaining: Math.max(0, dailyCap - used),
  }
}
