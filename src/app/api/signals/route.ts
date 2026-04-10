import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SIGNAL_WEIGHTS } from '@/lib/constants/signal-weights'
import { canIngestSignal } from '@/lib/stripe/tier-enforcement'
import type { SignalType } from '@/lib/types/database'
import type { TierName } from '@/lib/constants/tiers'

const VALID_TYPES: SignalType[] = [
  'feedback',
  'voice',
  'analytics',
  'error',
  'builder',
]

export async function POST(request: Request) {
  const body = await request.json()
  const { project_id, type, title, content, metadata } = body

  // Validate required fields
  if (!project_id || !type || !content) {
    return NextResponse.json(
      { error: 'Missing required fields: project_id, type, content' },
      { status: 400 },
    )
  }

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json(
      {
        error: `Invalid signal type. Must be one of: ${VALID_TYPES.join(', ')}`,
      },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Verify project exists and get org for tier check
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, allowed_domains, status, orgs(tier)')
    .eq('id', project_id)
    .single()

  if (!project || project.status !== 'active') {
    return NextResponse.json(
      { error: 'Project not found or inactive' },
      { status: 404 },
    )
  }

  // Domain allowlist validation
  const origin = request.headers.get('origin') || ''
  const allowedDomains: string[] = project.allowed_domains || []
  if (allowedDomains.length > 0 && origin) {
    const originHost = new URL(origin).hostname
    const allowed = allowedDomains.some((domain: string) => {
      // Support wildcard subdomains: *.example.com
      if (domain.startsWith('*.')) {
        return (
          originHost.endsWith(domain.slice(1)) ||
          originHost === domain.slice(2)
        )
      }
      return originHost === domain
    })
    if (!allowed) {
      return NextResponse.json(
        { error: 'Domain not allowed' },
        { status: 403 },
      )
    }
  }

  // Tier-based rate limiting (monthly signal cap)
  const org = project.orgs as unknown as { tier: TierName }
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: monthlyCount } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', project_id)
    .gte('created_at', startOfMonth.toISOString())

  const tierCheck = canIngestSignal(org.tier, monthlyCount ?? 0)
  if (!tierCheck.allowed) {
    return NextResponse.json({ error: tierCheck.reason }, { status: 429 })
  }

  // Compute weight
  const weight = SIGNAL_WEIGHTS[type] ?? 1

  // Hash source user for per-user influence cap
  const sourceUserHash = metadata?.user_id
    ? await hashString(String(metadata.user_id))
    : null

  // Insert signal
  const { data: signal, error } = await supabase
    .from('signals')
    .insert({
      project_id,
      type,
      title: title || null,
      content,
      metadata: metadata || {},
      weight,
      source_user_hash: sourceUserHash,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { error: 'Failed to save signal' },
      { status: 500 },
    )
  }

  // CORS headers for widget — only reflect a known origin, never wildcard
  const corsHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (origin) {
    corsHeaders['Access-Control-Allow-Origin'] = origin
  }

  return new NextResponse(
    JSON.stringify({ id: signal.id, received: true }),
    {
      status: 201,
      headers: corsHeaders,
    },
  )
}

// CORS preflight — only reflect an actual origin, never wildcard
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

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
