import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient, transcribeAudio, checkRateLimit } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  transcribeAudio: vi.fn(),
  checkRateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/lib/ai/transcribe-audio', () => ({ transcribeAudio }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/constants/signal-weights', () => ({ SIGNAL_WEIGHTS: { voice: 5 } }))

import { POST } from './route'

const PROJECT_ID = '9e26a4c1-92b8-4f65-b306-571b82f35a10'
const ORIGIN = 'https://shipsitself.com'

function form({ projectId = PROJECT_ID, audio = true, transcript }: { projectId?: string; audio?: boolean; transcript?: string } = {}) {
  const data = new FormData()
  data.set('project_id', projectId)
  if (audio) data.set('audio', new File(['synthetic audio'], 'voice.webm', { type: 'audio/webm' }))
  if (transcript !== undefined) data.set('transcript', transcript)
  return data
}

function setup(project: unknown) {
  const inserted: unknown[] = []
  const from = vi.fn((table: string) => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      insert: vi.fn((payload: unknown) => { inserted.push(payload); return builder }),
      single: vi.fn(async () => table === 'projects'
        ? { data: project, error: null }
        : { data: { id: 'synthetic-signal-id' }, error: null }),
    }
    return builder
  })
  createAdminClient.mockReturnValue({ from })
  checkRateLimit.mockReturnValue({ allowed: true, resetIn: 0 })
  transcribeAudio.mockResolvedValue('synthetic transcript')
  return { from, inserted }
}

async function post(body: FormData, origin: string | undefined = ORIGIN) {
  const headers = new Headers()
  if (origin !== undefined) headers.set('origin', origin)
  const request = { headers, formData: async () => body } as unknown as Request
  return POST(request)
}

describe('compatibility-preserving POST /api/voice variant', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unknown and inactive projects before transcription', async () => {
    for (const project of [null, { status: 'disabled', allowed_domains: ['shipsitself.com'] }]) {
      const { inserted } = setup(project)
      const response = await post(form())
      expect(response.status).toBe(404)
      expect(transcribeAudio).not.toHaveBeenCalled()
      expect(inserted).toHaveLength(0)
      vi.clearAllMocks()
    }
  })

  it('rejects a forbidden Origin before transcription when domains are configured', async () => {
    const { inserted } = setup({ status: 'active', allowed_domains: ['shipsitself.com'] })
    const response = await post(form(), 'https://attacker.example')
    expect(response.status).toBe(403)
    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(0)
  })

  it('preserves empty-domain behavior for anonymous widget calls', async () => {
    const { inserted } = setup({ status: 'active', allowed_domains: [] })
    const response = await post(form(), ORIGIN)
    expect(response.status).toBe(201)
    expect(transcribeAudio).toHaveBeenCalledTimes(1)
    expect(inserted).toHaveLength(1)
    expect(await response.json()).toEqual({ id: 'synthetic-signal-id', transcript: 'synthetic transcript', received: true })
  })

  it('preserves missing-Origin behavior when no domain allowlist is configured', async () => {
    const { inserted } = setup({ status: 'active', allowed_domains: [] })
    const response = await post(form(), undefined)
    expect(response.status).toBe(201)
    expect(transcribeAudio).toHaveBeenCalledTimes(1)
    expect(inserted).toHaveLength(1)
  })

  it('preserves transcript-only requests without invoking Gemini', async () => {
    const { inserted } = setup({ status: 'active', allowed_domains: ['shipsitself.com'] })
    const response = await post(form({ audio: false, transcript: 'synthetic transcript' }))
    expect(response.status).toBe(201)
    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(inserted).toHaveLength(1)
  })
})
