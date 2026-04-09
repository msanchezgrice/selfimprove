import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'
import { transcribeAudio } from '@/lib/ai/transcribe-audio'

export async function POST(request: Request) {
  const formData = await request.formData()
  const projectId = formData.get('project_id') as string
  const audioFile = formData.get('audio') as File | null
  let transcript = formData.get('transcript') as string | null

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing project_id' },
      { status: 400 },
    )
  }

  // If audio file provided, transcribe it via Gemini
  if (audioFile && !transcript) {
    try {
      const buffer = await audioFile.arrayBuffer()
      transcript = await transcribeAudio(buffer, audioFile.type)
    } catch {
      return NextResponse.json(
        { error: 'Failed to transcribe audio' },
        { status: 422 },
      )
    }
  }

  if (!transcript) {
    return NextResponse.json(
      { error: 'No audio or transcript provided' },
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
      metadata: {
        page_url: formData.get('page_url') || '',
        source: 'voice_companion',
      },
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
    JSON.stringify({ id: signal.id, transcript, received: true }),
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
