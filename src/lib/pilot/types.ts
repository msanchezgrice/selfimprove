export type PilotOption = {
  id: string
  label: string
  detail: string
  votes: number
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
}

/** What the client sees (no voter map). */
export type PublicState = {
  character: CharacterState
  episodes: Array<Omit<PilotEpisode, 'videoPrompt' | 'hfRequestId'>>
  currentEpisodeId: string | null
  renderingEnabled: boolean
}
