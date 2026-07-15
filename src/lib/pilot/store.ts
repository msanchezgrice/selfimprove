import { createAdminClient } from '@/lib/supabase/admin'
import { seedState } from './seed'
import type { PilotState, PublicState } from './types'

const BUCKET = 'pilot'
const KEY = 'state.json'

/**
 * Prototype persistence: a single JSON blob in Supabase Storage.
 * Zero-migration by design — graduates to real tables (pilot_episodes,
 * pilot_votes) once the loop is validated. Low-volume writes only.
 */
export async function getState(): Promise<PilotState> {
  const sb = createAdminClient()
  const { data, error } = await sb.storage.from(BUCKET).download(KEY)
  if (error || !data) {
    const seeded = seedState()
    await saveState(seeded)
    return seeded
  }
  try {
    return JSON.parse(await data.text()) as PilotState
  } catch {
    const seeded = seedState()
    await saveState(seeded)
    return seeded
  }
}

export async function saveState(state: PilotState): Promise<void> {
  const sb = createAdminClient()
  const body = JSON.stringify(state)
  const upload = () =>
    sb.storage.from(BUCKET).upload(KEY, body, {
      upsert: true,
      contentType: 'application/json',
    })

  let { error } = await upload()
  if (error) {
    // Bucket may not exist yet — create it and retry once.
    await sb.storage.createBucket(BUCKET, { public: false })
    ;({ error } = await upload())
  }
  if (error) {
    throw new Error(`pilot: failed to save state: ${error.message}`)
  }
}

export function toPublicState(state: PilotState): PublicState {
  const episodes = state.episodes.map((ep) => {
    const rest = { ...ep } as Partial<typeof ep>
    delete rest.videoPrompt
    delete rest.hfRequestId
    return rest as Omit<typeof ep, 'videoPrompt' | 'hfRequestId'>
  })
  return {
    character: state.character,
    episodes,
    currentEpisodeId: state.episodes.length
      ? state.episodes[state.episodes.length - 1].id
      : null,
    renderingEnabled: hasRenderCreds(),
  }
}

export function hasRenderCreds(): boolean {
  return Boolean(
    process.env.HF_CREDENTIALS ||
      (process.env.HF_API_KEY && process.env.HF_API_SECRET)
  )
}
