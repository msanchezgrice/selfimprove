/**
 * Higgsfield *consumer* API (fnf.higgsfield.ai) — the funded Ultra account.
 * Distinct from platform.higgsfield.ai API keys (often 0 credits).
 *
 * Auth: OAuth Bearer from device login. Refresh tokens rotate on every refresh.
 */

import type { PilotState } from '@/lib/pilot/types'

const API_BASE = process.env.HIGGSFIELD_API_URL || 'https://fnf.higgsfield.ai'
const AUTH_BASE =
  process.env.HIGGSFIELD_DEVICE_AUTH_URL || 'https://fnf-device-auth.higgsfield.ai'
const UA = 'selfimprove-pilot/1.0 (higgsfield-consumer)'

export type HiggsfieldAuth = {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
}

export function hasConsumerCreds(state?: PilotState | null): boolean {
  if (state?.higgsfieldAuth?.refreshToken) return true
  return Boolean(process.env.HF_REFRESH_TOKEN || process.env.HF_ACCESS_TOKEN)
}

function authFromEnv(): HiggsfieldAuth | null {
  const refreshToken = process.env.HF_REFRESH_TOKEN
  const accessToken = process.env.HF_ACCESS_TOKEN
  if (!refreshToken && !accessToken) return null
  return {
    accessToken: accessToken || '',
    refreshToken: refreshToken || '',
    // Environment access tokens do not carry a trustworthy expiry timestamp.
    // If a refresh token exists, refresh immediately rather than blessing a
    // potentially stale access token for another 50 minutes.
    accessExpiresAt: refreshToken
      ? new Date(0).toISOString()
      : new Date(Date.now() + 50 * 60_000).toISOString(),
  }
}

export function getStoredAuth(state: PilotState): HiggsfieldAuth | null {
  return state.higgsfieldAuth || authFromEnv()
}

async function refreshAccessToken(refreshToken: string): Promise<HiggsfieldAuth> {
  const res = await fetch(`${AUTH_BASE}/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`higgsfield consumer: refresh failed ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in?: number
  }
  if (!json.access_token || !json.refresh_token) {
    throw new Error('higgsfield consumer: refresh missing tokens')
  }
  const expiresIn = json.expires_in ?? 3600
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }
}

/**
 * Returns a valid access token and persists rotated refresh tokens onto state.
 * Caller must saveState if authChanged.
 */
export async function ensureConsumerAuth(
  state: PilotState
): Promise<{ token: string; authChanged: boolean }> {
  let auth = getStoredAuth(state)
  if (!auth) {
    throw new Error(
      'higgsfield consumer: set HF_REFRESH_TOKEN (from `higgsfield auth token` / credentials.json)'
    )
  }

  const expiresAt = Date.parse(auth.accessExpiresAt || '0')
  const freshEnough = auth.accessToken && expiresAt - Date.now() > 60_000
  if (freshEnough) {
    state.higgsfieldAuth = auth
    return { token: auth.accessToken, authChanged: false }
  }

  if (!auth.refreshToken) {
    throw new Error('higgsfield consumer: access token expired and no HF_REFRESH_TOKEN')
  }

  auth = await refreshAccessToken(auth.refreshToken)
  state.higgsfieldAuth = auth
  return { token: auth.accessToken, authChanged: true }
}

async function apiFetch(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('User-Agent', UA)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

type MediaKind = 'image' | 'video' | 'audio'
type ConsumerMedia = { id: string; role: string }
type ConsumerReferenceOptions = {
  imageUrl: string
  startImageUrl?: string | null
  videoReferenceUrl?: string | null
  audioReferenceUrl?: string | null
}

export function buildConsumerReferencePlan(
  model: string,
  opts: ConsumerReferenceOptions
): Array<{ url: string; kind: MediaKind; role: string }> {
  const seedance = model === 'seedance_2_0' || model === 'seedance_2_0_mini'
  if (!seedance) {
    return [{ url: opts.startImageUrl || opts.imageUrl, kind: 'image', role: 'input_image' }]
  }

  const references: Array<{ url: string; kind: MediaKind; role: string }> = [
    {
      url: opts.startImageUrl || opts.imageUrl,
      kind: 'image',
      role: 'start_image',
    },
  ]
  if (opts.videoReferenceUrl) {
    references.push({ url: opts.videoReferenceUrl, kind: 'video', role: 'video' })
  }
  if (opts.audioReferenceUrl) {
    references.push({ url: opts.audioReferenceUrl, kind: 'audio', role: 'audio' })
  }
  return references
}

export function buildConsumerJobPayload(
  model: string,
  prompt: string,
  duration: 5 | 10,
  medias: ConsumerMedia[]
) {
  const seedance = model === 'seedance_2_0' || model === 'seedance_2_0_mini'
  return {
    job_set_type: model,
    params: seedance
      ? {
          prompt,
          aspect_ratio: '9:16',
          duration,
          resolution: '720p',
          ...(model === 'seedance_2_0' ? { mode: 'std' } : {}),
          genre: 'comedy',
          bitrate_mode: 'standard',
          generate_audio: true,
        }
      : {
          prompt,
          aspect_ratio: '9:16',
          duration,
          sound: true,
        },
    medias,
  }
}

async function uploadMediaFromUrl(
  token: string,
  mediaUrl: string,
  kind: MediaKind
): Promise<string> {
  const mediaRes = await fetch(mediaUrl, { cache: 'no-store' })
  if (!mediaRes.ok) {
    throw new Error(`higgsfield consumer: failed to fetch ${kind} ${mediaRes.status}`)
  }
  const buf = Buffer.from(await mediaRes.arrayBuffer())
  const fallbackType = kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/wav' : 'image/png'
  const contentType = mediaRes.headers.get('content-type')?.split(';')[0] || fallbackType
  const ext = contentType.includes('jpeg') || contentType.includes('jpg')
    ? 'jpg'
    : contentType.includes('mp4')
      ? 'mp4'
      : contentType.includes('mpeg')
        ? 'mp3'
        : contentType.includes('ogg')
          ? 'ogg'
          : contentType.includes('wav')
            ? 'wav'
            : 'png'
  const filename = `pilot-${kind}.${ext}`

  const initRes = await apiFetch(token, `/agents/uploads?type=${kind}`, {
    method: 'POST',
    body: JSON.stringify({
      type: kind,
      length: buf.length,
      filename,
      content_type: contentType,
    }),
  })
  if (!initRes.ok) {
    const text = await initRes.text().catch(() => '')
    throw new Error(`higgsfield consumer: upload init ${initRes.status}: ${text.slice(0, 200)}`)
  }
  const initJson = (await initRes.json()) as { id: string; upload_url: string }
  if (!initJson.id || !initJson.upload_url) {
    throw new Error('higgsfield consumer: upload init missing id/upload_url')
  }

  const putRes = await fetch(initJson.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType, 'User-Agent': UA },
    body: buf,
  })
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '')
    throw new Error(`higgsfield consumer: upload PUT ${putRes.status}: ${text.slice(0, 200)}`)
  }

  const confRes = await apiFetch(token, `/agents/uploads/${initJson.id}/confirm?type=${kind}`, {
    method: 'POST',
  })
  if (!confRes.ok) {
    const text = await confRes.text().catch(() => '')
    throw new Error(`higgsfield consumer: upload confirm ${confRes.status}: ${text.slice(0, 200)}`)
  }

  return initJson.id
}

export async function submitConsumerImageToVideo(
  state: PilotState,
  opts: ConsumerReferenceOptions & {
    prompt: string
    duration?: 5 | 10
  }
): Promise<{ requestId: string; authChanged: boolean }> {
  const { token, authChanged } = await ensureConsumerAuth(state)
  const model = process.env.HIGGSFIELD_CONSUMER_MODEL || 'seedance_2_0'
  const medias: ConsumerMedia[] = []

  // Live Seedance validation rejects a generic image plus a separate start
  // image as duplicate start_image roles. The pure plan is regression-tested
  // before any uploads or credits are involved.
  for (const reference of buildConsumerReferencePlan(model, opts)) {
    const id = await uploadMediaFromUrl(token, reference.url, reference.kind)
    medias.push({ id, role: reference.role })
  }

  const res = await apiFetch(token, '/agents/jobs', {
    method: 'POST',
    body: JSON.stringify(
      buildConsumerJobPayload(model, opts.prompt, opts.duration ?? 10, medias)
    ),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`higgsfield consumer: create job ${res.status}: ${text.slice(0, 300)}`)
  }

  const json = (await res.json()) as string[] | { id?: string; job_id?: string }
  const requestId = Array.isArray(json)
    ? json[0]
    : json.id || json.job_id
  if (!requestId) {
    throw new Error(`higgsfield consumer: no job id in ${JSON.stringify(json).slice(0, 200)}`)
  }
  return { requestId, authChanged }
}

export type ConsumerRenderCheck =
  | { status: 'pending' }
  | { status: 'completed'; videoUrl: string; thumbnailUrl?: string | null }
  | { status: 'failed'; reason: string }

export async function checkConsumerRender(
  state: PilotState,
  requestId: string
): Promise<{ check: ConsumerRenderCheck; authChanged: boolean }> {
  const { token, authChanged } = await ensureConsumerAuth(state)
  const res = await apiFetch(token, `/agents/jobs/${requestId}`, { method: 'GET' })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`higgsfield consumer: status ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    status?: string
    result_url?: string | null
    thumbnail_url?: string | null
  }
  const status = (json.status || 'queued').toLowerCase()
  if ((status === 'completed' || status === 'success') && json.result_url) {
    return {
      check: {
        status: 'completed',
        videoUrl: json.result_url,
        thumbnailUrl: json.thumbnail_url || null,
      },
      authChanged,
    }
  }
  if (status === 'failed' || status === 'nsfw' || status === 'cancelled') {
    return { check: { status: 'failed', reason: status }, authChanged }
  }
  return { check: { status: 'pending' }, authChanged }
}
