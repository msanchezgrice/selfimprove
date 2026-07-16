import { describe, expect, it } from 'vitest'
import {
  buildConsumerJobPayload,
  buildConsumerReferencePlan,
  getStoredAuth,
} from './higgsfield-consumer'

describe('Higgsfield consumer payload', () => {
  it('never sends identity and boundary as duplicate Seedance start images', () => {
    expect(
      buildConsumerReferencePlan('seedance_2_0', {
        imageUrl: 'identity.png',
        startImageUrl: 'boundary.png',
        videoReferenceUrl: 'prior.mp4',
        audioReferenceUrl: 'voice.wav',
      })
    ).toEqual([
      { url: 'boundary.png', kind: 'image', role: 'start_image' },
      { url: 'prior.mp4', kind: 'video', role: 'video' },
      { url: 'voice.wav', kind: 'audio', role: 'audio' },
    ])
  })

  it('uses the supported Seedance boundary, motion, and voice references', () => {
    const payload = buildConsumerJobPayload('seedance_2_0', 'prompt', 10, [
      { id: 'boundary', role: 'start_image' },
      { id: 'previous-video', role: 'video' },
      { id: 'voice', role: 'audio' },
    ])

    expect(payload.job_set_type).toBe('seedance_2_0')
    expect(payload.params).toMatchObject({
      aspect_ratio: '9:16',
      duration: 10,
      resolution: '720p',
      mode: 'std',
      genre: 'comedy',
      generate_audio: true,
    })
    expect(payload.medias.map((media) => media.role)).toEqual([
      'start_image',
      'video',
      'audio',
    ])
  })

  it('keeps the legacy one-image payload for explicitly selected Kling models', () => {
    const payload = buildConsumerJobPayload('kling2_6', 'prompt', 10, [
      { id: 'boundary', role: 'input_image' },
    ])

    expect(payload.params).toMatchObject({ sound: true })
    expect(payload.medias).toHaveLength(1)
  })
})

describe('Higgsfield environment auth', () => {
  it('forces a refresh when an environment refresh token is available', () => {
    const priorAccess = process.env.HF_ACCESS_TOKEN
    const priorRefresh = process.env.HF_REFRESH_TOKEN
    process.env.HF_ACCESS_TOKEN = 'possibly-stale-access'
    process.env.HF_REFRESH_TOKEN = 'rotating-refresh'

    try {
      const auth = getStoredAuth({} as Parameters<typeof getStoredAuth>[0])
      expect(auth?.accessExpiresAt).toBe(new Date(0).toISOString())
    } finally {
      if (priorAccess === undefined) delete process.env.HF_ACCESS_TOKEN
      else process.env.HF_ACCESS_TOKEN = priorAccess
      if (priorRefresh === undefined) delete process.env.HF_REFRESH_TOKEN
      else process.env.HF_REFRESH_TOKEN = priorRefresh
    }
  })
})
