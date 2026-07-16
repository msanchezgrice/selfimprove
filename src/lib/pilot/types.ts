export type ScreenDirection =
  | 'camera-left'
  | 'camera-right'
  | 'toward-camera'
  | 'away-from-camera'
  | 'stationary'

/** A script-supervisor snapshot of the exact first/last visible frame. */
export type ShotBoundary = {
  location: string
  position: string
  facing: string
  screenDirection: ScreenDirection
  motion: string
  wardrobe: string
  hair: string
  props: string[]
  lighting: string
  camera: string
  expression: string
}

export type SpokenLine = {
  text: string
  delivery: string
}

export type ShotTransition = {
  mode: 'continuous' | 'match-on-action' | 'time-bridge'
  /** What remains visibly continuous through the cut(s). */
  description: string
}

/**
 * A vote option is also a pre-approved production package. If it wins, the
 * next episode must start and finish at these boundaries without rewriting it.
 */
export type ShotContinuity = {
  opening: ShotBoundary
  action: string
  closing: ShotBoundary
  transition: ShotTransition
  dialogue: SpokenLine | null
}

export type CharacterProductionBible = {
  id: string
  name: string
  age: number
  identityReferenceUrl: string
  /** Optional provider-native persistent identity/reference element. */
  identityElementId?: string | null
  face: string
  hair: string
  body: string
  wardrobe: string
  voice: {
    description: string
    referenceUrl?: string | null
    voiceId?: string | null
  }
}

export type PilotProductionBible = {
  version: number
  visualStyle: string
  continuityRules: string[]
  characters: Record<string, CharacterProductionBible>
}

export type PilotOption = {
  id: string
  label: string
  detail: string
  votes: number
  /**
   * Locked camera package — pre-approved at vote time.
   * When this option wins, Higgsfield films THIS action (not a post-hoc rewrite).
   */
  visualBeat?: string
  /** Locked blocking / open-middle-close for the i2v shot if this option wins. */
  stageDirection?: string
  /** Structured start/end contract used by the writer, renderer, and validator. */
  continuity?: ShotContinuity
}

export type RenderStatus = 'none' | 'rendering' | 'done' | 'failed'

export type ContinuityReview = {
  status: 'needed' | 'analyzing' | 'ready' | 'failed'
  observedAt: string | null
  confidence: number | null
  travelPhase: 'departing' | 'in-transit' | 'arriving' | 'stationary' | 'unclear' | null
  completedActions: string[]
  mismatches: string[]
  evidence: string[]
  error?: string | null
}

export type PilotEpisode = {
  id: string
  number: number
  title: string
  logline: string
  script: string
  videoPrompt: string
  videoUrl: string | null
  posterUrl: string
  /** Exact extracted final frame; thumbnails/posters are not continuity frames. */
  lastFrameUrl?: string | null
  renderStatus: RenderStatus
  hfRequestId: string | null
  options: PilotOption[]
  winnerOptionId: string | null
  /** The locked package that produced this episode. */
  continuity?: ShotContinuity
  /** Vision-based reconciliation of the rendered ending against the plan. */
  continuityReview?: ContinuityReview
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
  /** Optional for backward compatibility with already-persisted prototype state. */
  productionBible?: PilotProductionBible
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
