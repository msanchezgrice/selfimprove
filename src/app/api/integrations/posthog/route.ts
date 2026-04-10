import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { project_id } = await request.json()
  if (!project_id) return NextResponse.json({ error: 'Missing project_id' }, { status: 400 })

  const admin = createAdminClient()

  // Get PostHog API key from project settings
  const { data: settings } = await admin
    .from('project_settings')
    .select('posthog_api_key')
    .eq('project_id', project_id)
    .single()

  if (!settings?.posthog_api_key) {
    return NextResponse.json({ error: 'PostHog not connected' }, { status: 400 })
  }

  // Fetch recent events from PostHog
  // PostHog API: https://posthog.com/docs/api/query
  try {
    const eventsRes = await fetch('https://app.posthog.com/api/event/?limit=100&order_by=-timestamp', {
      headers: {
        Authorization: `Bearer ${settings.posthog_api_key}`,
        'Content-Type': 'application/json',
      },
    })

    if (!eventsRes.ok) {
      return NextResponse.json({ error: 'PostHog API error' }, { status: eventsRes.status })
    }

    const data = await eventsRes.json()
    const events = data.results || []

    // Filter for interesting events (errors, rage clicks, slow pages)
    const interestingEvents = events.filter((e: any) => {
      const name = e.event || ''
      return (
        name.includes('$exception') ||
        name.includes('$rageclick') ||
        name.includes('$pageleave') ||
        name.includes('$pageview') ||
        name === '$autocapture' ||
        !name.startsWith('$') // custom events
      )
    })

    // Group by event type and create signals
    const eventGroups = new Map<string, any[]>()
    for (const event of interestingEvents.slice(0, 50)) {
      const key = event.event
      const existing = eventGroups.get(key) || []
      existing.push(event)
      eventGroups.set(key, existing)
    }

    const signals: {
      project_id: string
      type: 'analytics' | 'error'
      title: string
      content: string
      metadata: Record<string, unknown>
      weight: number
    }[] = []

    for (const [eventName, groupedEvents] of eventGroups) {
      let type: 'analytics' | 'error' = 'analytics'
      let title = ''
      let content = ''

      if (eventName.includes('$exception') || eventName.includes('error')) {
        type = 'error'
        title = `PostHog Error: ${groupedEvents[0]?.properties?.$exception_message || eventName}`
        content = `${groupedEvents.length} occurrence(s) of "${eventName}". ${groupedEvents[0]?.properties?.$exception_message || ''}`
      } else if (eventName === '$rageclick') {
        title = `Rage clicks detected`
        content = `${groupedEvents.length} rage click(s) detected. Users are frustrated — check the affected pages.`
      } else if (eventName === '$pageleave') {
        title = `High bounce rate pages`
        const pages = groupedEvents.map((e: any) => e.properties?.$current_url).filter(Boolean)
        const pageCounts = new Map<string, number>()
        pages.forEach((p: string) => pageCounts.set(p, (pageCounts.get(p) || 0) + 1))
        const topPages = [...pageCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
        content = `Top bounce pages:\n${topPages.map(([url, count]) => `- ${url} (${count} exits)`).join('\n')}`
      } else {
        title = `PostHog: ${eventName} (${groupedEvents.length} events)`
        content = `Custom event "${eventName}" fired ${groupedEvents.length} times in the last period.`
      }

      signals.push({
        project_id,
        type,
        title,
        content,
        metadata: {
          source: 'posthog',
          event_name: eventName,
          event_count: groupedEvents.length,
          sample_properties: groupedEvents[0]?.properties || {},
        },
        weight: SIGNAL_WEIGHTS[type],
      })
    }

    if (signals.length > 0) {
      await admin.from('signals').insert(signals)
    }

    return NextResponse.json({ imported: signals.length, eventsChecked: interestingEvents.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PostHog sync failed' },
      { status: 500 }
    )
  }
}
