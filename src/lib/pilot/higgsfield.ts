/**
 * Minimal server-side client for the Higgsfield platform API.
 * Docs: https://docs.higgsfield.ai · SDK: github.com/higgsfield-ai/higgsfield-js
 *
 * Auth: `Authorization: Key KEY_ID:KEY_SECRET`
 * Env:  HF_CREDENTIALS="key:secret"  (or HF_API_KEY + HF_API_SECRET)
 * Optional overrides: HIGGSFIELD_VIDEO_PATH (default /v1/image2video/dop),
 *                     HIGGSFIELD_VIDEO_MODEL (default dop-turbo)
 */

const BASE = process.env.HIGGSFIELD_API_BASE || 'https://platform.higgsfield.ai'

function credentials(): string | null {
  if (process.env.HF_CREDENTIALS) return process.env.HF_CREDENTIALS
  if (process.env.HF_API_KEY && process.env.HF_API_SECRET) {
    return `${process.env.HF_API_KEY}:${process.env.HF_API_SECRET}`
  }
  return null
}

type SubmitResult = { requestId: string }

export async function submitImageToVideo(opts: {
  prompt: string
  imageUrl: string
}): Promise<SubmitResult> {
  const creds = credentials()
  if (!creds) throw new Error('higgsfield: no API credentials configured')

  const path = process.env.HIGGSFIELD_VIDEO_PATH || '/v1/image2video/dop'
  const model = process.env.HIGGSFIELD_VIDEO_MODEL || 'dop-turbo'

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${creds}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt: opts.prompt,
      input_images: [{ type: 'image_url', image_url: opts.imageUrl }],
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`higgsfield: submit failed ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = (await res.json()) as Record<string, unknown>
  const requestId =
    (json.request_id as string) ||
    (json.id as string) ||
    (json.job_set_id as string)
  if (!requestId) {
    throw new Error(`higgsfield: no request id in response: ${JSON.stringify(json).slice(0, 300)}`)
  }
  return { requestId }
}

export type RenderCheck =
  | { status: 'pending' }
  | { status: 'completed'; videoUrl: string }
  | { status: 'failed'; reason: string }

export async function checkRender(requestId: string): Promise<RenderCheck> {
  const creds = credentials()
  if (!creds) throw new Error('higgsfield: no API credentials configured')

  const res = await fetch(`${BASE}/requests/${requestId}/status`, {
    headers: { Authorization: `Key ${creds}` },
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`higgsfield: status failed ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    status?: string
    video?: { url?: string }
    jobs?: Array<{ status?: string; results?: { raw?: { url?: string } } }>
  }

  const status = json.status || json.jobs?.[0]?.status || 'queued'
  const videoUrl = json.video?.url || json.jobs?.[0]?.results?.raw?.url

  if (status === 'completed' && videoUrl) {
    return { status: 'completed', videoUrl }
  }
  if (status === 'failed' || status === 'nsfw') {
    return { status: 'failed', reason: status }
  }
  return { status: 'pending' }
}
