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
      if (buffer.byteLength === 0) {
        return NextResponse.json(
          { error: 'Empty audio file' },
          { status: 400 },
        )
      }
      transcript = await transcribeAudio(buffer, audioFile.type || 'audio/webm')
    } catch (err) {
      console.error('[voice] Transcription failed:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: `Transcription failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
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

  // Verify project exists and get allowed domains
  const { data: project } = await supabase
    .from('projects')
    .select('id, status, allowed_domains')
    .eq('id', projectId)
    .single()

  if (!project || project.status !== 'active') {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 },
    )
  }

  // Validate origin against allowed domains
  const origin = request.headers.get('origin')
  const allowedDomains: string[] = project.allowed_domains || []
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

  const { data: signal, error } = await supabase
    .from('signals')
    .insert({
      project_id: projectId,
      type: 'voice' as const,
      content: transcript,
      metadata: {
        page_url: formData.get('page_url') || '',
        page_title: formData.get('page_title') || '',
        viewport: formData.get('viewport') || '',
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

  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  }

  return new NextResponse(
    JSON.stringify({ id: signal.id, transcript, received: true }),
    {
      status: 201,
      headers: corsHeaders,
    },
  )
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) {
    return new NextResponse(null, { status: 204 })
  }
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
