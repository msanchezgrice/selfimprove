import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  // Fetch settings and project's allowed_domains together
  const [{ data: settings }, { data: project }] = await Promise.all([
    supabase
      .from('project_settings')
      .select('widget_enabled, widget_color, widget_position, widget_style, widget_button_text, widget_tags, voice_enabled')
      .eq('project_id', id)
      .single(),
    supabase
      .from('projects')
      .select('allowed_domains')
      .eq('id', id)
      .single(),
  ])

  if (!settings) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!settings.widget_enabled) {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  // Validate origin against allowed domains
  const origin = _req.headers.get('origin')
  const allowedDomains: string[] = project?.allowed_domains || []
  if (allowedDomains.length > 0 && origin) {
    const originHost = new URL(origin).hostname
    const allowed = allowedDomains.some((domain: string) => {
      if (domain.startsWith('*.')) {
        return originHost.endsWith(domain.slice(1)) || originHost === domain.slice(2)
      }
      return originHost === domain
    })
    if (!allowed) {
      return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 })
    }
  }

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=60',
  }
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  }

  return new NextResponse(
    JSON.stringify({
      enabled: true,
      color: settings.widget_color,
      position: settings.widget_position,
      style: settings.widget_style,
      text: settings.widget_button_text,
      tags: settings.widget_tags,
      voice: settings.voice_enabled,
    }),
    {
      headers: corsHeaders,
    }
  )
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin')
  if (!origin) {
    return new NextResponse(null, { status: 204 })
  }
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  })
}
