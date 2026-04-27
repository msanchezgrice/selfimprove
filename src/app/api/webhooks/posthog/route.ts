import crypto from 'crypto'

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { rollupProjectFunnel } from '@/lib/brain/funnel-rollup'
import type { PosthogSubscriptionRow } from '@/lib/types/database'

/**
 * Real-time PostHog webhook receiver.
 *
 * PostHog HogQL Alerts post a JSON body when an insight breaches its
 * threshold. We don't care about the alert body's specific shape — we
 * only need:
 *   - Which project it belongs to (looked up via the URL secret param).
 *   - That an alert fired (which means *something* moved enough to retrigger
 *     a rollup right now instead of waiting for the daily cron).
 *
 * The webhook auth uses an HMAC-SHA256 signature in the `X-PostHog-Signature`
 * header (PostHog's documented pattern: signature = hex(hmac_sha256(secret, body))).
 * We compare timing-safely against the stored secret on
 * `posthog_subscriptions.secret`.
 *
 * On success: kick off `rollupProjectFunnel` with `source='webhook'` so
 * any anomaly the daily cron would have caught also gets caught now.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const projectId = url.searchParams.get('project')
  if (!projectId) {
    return NextResponse.json({ error: 'project query param required' }, { status: 400 })
  }

  const rawBody = await request.text()
  const signatureHeader =
    request.headers.get('x-posthog-signature') ?? request.headers.get('x-signature')

  const supabase = createAdminClient()
  const { data: subRow } = await supabase
    .from('posthog_subscriptions')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  const sub = subRow as PosthogSubscriptionRow | null
  if (!sub) {
    return NextResponse.json({ error: 'No subscription for project' }, { status: 404 })
  }
  if (sub.status !== 'active') {
    return NextResponse.json({ error: `Subscription is ${sub.status}` }, { status: 409 })
  }

  if (!verifyPostHogSignature(rawBody, signatureHeader, sub.secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Bookkeeping: update last_event_at without blocking.
  await supabase
    .from('posthog_subscriptions')
    .update({ last_event_at: new Date().toISOString() })
    .eq('id', sub.id)

  // Run the rollup with source='webhook' so anomalies show their origin.
  try {
    const result = await rollupProjectFunnel(supabase, projectId, { source: 'webhook' })
    return NextResponse.json({
      status: 'ok',
      anomalies: result.anomaliesMinted,
      signals: result.signalsMinted,
      stops: result.stopsTouched,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[webhooks/posthog] rollup failed', { projectId, error: message })
    return NextResponse.json({ status: 'rollup_failed', error: message }, { status: 500 })
  }
}

function verifyPostHogSignature(body: string, header: string | null, secret: string): boolean {
  if (!header) return false
  // PostHog uses `sha256=<hex>` style or just the raw hex. Accept both.
  const provided = header.startsWith('sha256=') ? header.slice(7) : header
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex')
  if (provided.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}
