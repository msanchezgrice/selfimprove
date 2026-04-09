import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data: settings } = await supabase
    .from('project_settings')
    .select('widget_enabled, widget_color, widget_position, widget_style, widget_button_text, widget_tags, voice_enabled')
    .eq('project_id', id)
    .single()

  if (!settings) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!settings.widget_enabled) {
    return NextResponse.json({ enabled: false }, { status: 200 })
  }

  const origin = _req.headers.get('origin') || '*'
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'public, max-age=60',
      },
    }
  )
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || '*'
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  })
}
