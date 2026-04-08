import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'

export async function POST(request: Request) {
  const formData = await request.formData()
  const projectId = formData.get('project_id') as string
  const transcript = formData.get('transcript') as string

  if (!projectId || !transcript) {
    return NextResponse.json(
      { error: 'Missing project_id or transcript' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Verify project exists
  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .single()

  if (!project || project.status !== 'active') {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 },
    )
  }

  const { data: signal, error } = await supabase
    .from('signals')
    .insert({
      project_id: projectId,
      type: 'voice' as const,
      content: transcript,
      metadata: { page_url: formData.get('page_url') || '' },
      weight: SIGNAL_WEIGHTS.voice,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to save voice signal' },
      { status: 500 },
    )
  }

  const origin = request.headers.get('origin') || '*'
  return new NextResponse(
    JSON.stringify({ id: signal.id, received: true }),
    {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin,
      },
    },
  )
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') || '*'
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
