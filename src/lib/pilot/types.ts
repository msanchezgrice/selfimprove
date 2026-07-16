export type PilotOption = {
  id: string
  label: string
  detail: string
  votes: number
  /**
   * Director note for video coherence — what we should SEE Devon do
   * if this option wins (used when writing the next episode's i2v prompt).
   */
  visualBeat?: string
}

export type RenderStatus = 'none' | 'rendering' | 'done' | 'failed'

export type PilotEpisode = {
  id: string
  number: number
  title: string
  logline: string
  script: string
  videoPrompt: string
  videoUrl: string | null
  posterUrl: string
  renderStatus: RenderStatus
  hfRequestId: string | null
  options: PilotOption[]
  winnerOptionId: string | null
  createdAt: string
}

export type CharacterState = {
  name: string
  job: string
  savings: number
  energy: number
  social: string
  mood: string
}

export type PilotState = {
  character: CharacterState
  episodes: PilotEpisode[]
  /** episodeId -> voterId -> optionId */
  voters: Record<string, Record<string, string>>
  lastCycleAt: string | null
  /** Rotating consumer OAuth tokens for fnf.higgsfield.ai (server-only). */
  higgsfieldAuth?: {
    accessToken: string
    refreshToken: string
    accessExpiresAt: string
  }
}

/** What the client sees (no voter map). */
export type PublicState = {
  character: CharacterState
  episodes: Array<Omit<PilotEpisode, 'videoPrompt' | 'hfRequestId'>>
  currentEpisodeId: string | null
  renderingEnabled: boolean
  /** `consumer` = funded fnf account; `api` = platform keys; `session` = external CLI attach; `off` */
  renderMode?: 'consumer' | 'session' | 'api' | 'off'
}
