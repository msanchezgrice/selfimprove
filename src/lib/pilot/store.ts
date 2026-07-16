import { createAdminClient } from '@/lib/supabase/admin'
import { seedState } from './seed'
import type { PilotState, PublicState } from './types'

const BUCKET = 'pilot'
const KEY = 'state.json'
const ROW_ID = 'main'
const MAX_SAVE_RETRIES = 8

type Versioned = { state: PilotState; version: number | null }

/**
 * Durable persistence: Postgres `pilot_state` (jsonb + version) with a
 * Storage blob fallback for environments that haven't run the migration yet.
 */
export async function getState(): Promise<PilotState> {
  const versioned = await loadVersioned()
  return versioned.state
}

/**
 * Read → mutate → write with optimistic concurrency. Retries on version
 * conflict so concurrent votes don't clobber each other.
 */
export async function updateState(
  mutator: (state: PilotState) => void | Promise<void>
): Promise<PilotState> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_SAVE_RETRIES; attempt++) {
    const { state, version } = await loadVersioned()
    const next = structuredClone(state) as PilotState
    await mutator(next)
    try {
      await persist(next, version)
      return next
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (/version conflict/.test(lastError.message)) continue
      throw lastError
    }
  }

  throw lastError ?? new Error('pilot: failed to save state after retries')
}

/** @deprecated Prefer updateState for mutations. Kept for attach/seed paths. */
export async function saveState(state: PilotState): Promise<void> {
  const existing = await readFromDb()
  await persist(state, existing?.version ?? null)
}

async function loadVersioned(): Promise<Versioned> {
  const fromDb = await readFromDb()
  if (fromDb) return fromDb

  const fromStorage = await readFromStorage()
  if (fromStorage) {
    await writeToDb(fromStorage, null).catch(() => undefined)
    return { state: fromStorage, version: null }
  }

  const seeded = seedState()
  await persist(seeded, null)
  return { state: seeded, version: null }
}

async function persist(state: PilotState, expectedVersion: number | null): Promise<void> {
  try {
    await writeToDb(state, expectedVersion)
    await writeToStorage(state).catch(() => undefined)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/does not exist|42P01|PGRST/.test(message)) {
      await writeToStorage(state)
      return
    }
    throw err instanceof Error ? err : new Error(message)
  }
}

async function readFromDb(): Promise<Versioned | null> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('pilot_state')
      .select('state, version')
      .eq('id', ROW_ID)
      .maybeSingle()
    if (error) {
      if (/does not exist|42P01|PGRST|Could not find the table/.test(error.message)) {
        return null
      }
      console.error('pilot: db read failed', error.message)
      return null
    }
    if (!data?.state) return null
    return { state: data.state as PilotState, version: data.version as number }
  } catch {
    return null
  }
}

async function writeToDb(state: PilotState, expectedVersion: number | null): Promise<void> {
  const sb = createAdminClient()
  const now = new Date().toISOString()

  if (expectedVersion === null) {
    const { error } = await sb.from('pilot_state').upsert(
      { id: ROW_ID, state, version: 1, updated_at: now },
      { onConflict: 'id' }
    )
    if (error) throw new Error(error.message)
    return
  }

  const { data, error } = await sb
    .from('pilot_state')
    .update({ state, version: expectedVersion + 1, updated_at: now })
    .eq('id', ROW_ID)
    .eq('version', expectedVersion)
    .select('id')

  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('version conflict')
}

async function readFromStorage(): Promise<PilotState | null> {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb.storage.from(BUCKET).download(KEY)
    if (error || !data) return null
    return JSON.parse(await data.text()) as PilotState
  } catch {
    return null
  }
}

async function writeToStorage(state: PilotState): Promise<void> {
  const sb = createAdminClient()
  const body = JSON.stringify(state)
  const upload = () =>
    sb.storage.from(BUCKET).upload(KEY, body, {
      upsert: true,
      contentType: 'application/json',
    })

  let { error } = await upload()
  if (error) {
    await sb.storage.createBucket(BUCKET, { public: false })
    ;({ error } = await upload())
  }
  if (error) {
    throw new Error(`pilot: failed to save state: ${error.message}`)
  }
}

/**
 * Render backend for /pilot.
 *
 * Default `auto`:
 *   1. consumer — fnf.higgsfield.ai with HF_REFRESH_TOKEN (funded Ultra account)
 *   2. api — platform.higgsfield.ai with HF_API_KEY (often 0 credits)
 *   3. session — leave `rendering` for external CLI → /api/pilot/attach
 */
export type PilotRenderMode = 'auto' | 'consumer' | 'session' | 'api' | 'off'

export function getRenderMode(): Exclude<PilotRenderMode, 'auto'> {
  const mode = (process.env.PILOT_RENDER_MODE || 'auto').toLowerCase()
  if (mode === 'api' || mode === 'off' || mode === 'session' || mode === 'consumer') {
    return mode
  }
  if (process.env.HF_REFRESH_TOKEN || process.env.HF_ACCESS_TOKEN) return 'consumer'
  if (hasCloudApiCreds()) return 'api'
  return 'session'
}

export function hasCloudApiCreds(): boolean {
  return Boolean(
    process.env.HF_CREDENTIALS ||
      (process.env.HF_API_KEY && process.env.HF_API_SECRET)
  )
}

export function hasRenderCreds(): boolean {
  const mode = getRenderMode()
  if (mode === 'off') return false
  if (mode === 'api') return hasCloudApiCreds()
  if (mode === 'consumer') {
    return Boolean(process.env.HF_REFRESH_TOKEN || process.env.HF_ACCESS_TOKEN)
  }
  return true // session — external attach path
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
    renderMode: getRenderMode(),
  }
}

export function yourVoteFor(
  state: PilotState,
  episodeId: string | null | undefined,
  voterId: string | null | undefined
): string | null {
  if (!episodeId || !voterId) return null
  return state.voters[episodeId]?.[voterId] ?? null
}
