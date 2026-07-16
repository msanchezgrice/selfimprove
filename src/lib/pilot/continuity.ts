import type {
  PilotEpisode,
  PilotOption,
  PilotProductionBible,
  PilotState,
  ScreenDirection,
  ShotBoundary,
  ShotContinuity,
  ShotTransition,
  SpokenLine,
} from './types'

export const DEVON_IDENTITY_REFERENCE =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_205804_28d73e3b-67e5-45ec-9a92-63b27c3dbdf2.png'

const DEVON_WARDROBE =
  'charcoal crew-neck T-shirt, unbuttoned slate-blue overshirt, dark straight-leg chinos, worn white low-top sneakers, black watch on left wrist'

const DEVON_HAIR =
  'short dense curly brown hair, natural uneven curl line, same length and silhouette in every shot'

export function createProductionBible(): PilotProductionBible {
  return {
    version: 1,
    visualStyle:
      'grounded live-action workplace dramedy, natural skin texture, restrained warm/cool practical lighting, 35mm cinematic realism, vertical 9:16',
    continuityRules: [
      'Frame one must match the prior episode final frame before any new action begins.',
      'Preserve the 180-degree axis and screen direction unless the camera visibly crosses the axis.',
      'Never reset wardrobe, hair, carried props, hand occupancy, or body position between clips.',
      'A location change must be shown through a doorway, hall, vehicle, or explicit establishing transition.',
      'Hold the final pose and prop state for at least half a second so it can seed the next clip.',
      'Use the immediately previous boundary frame as the visual start anchor and the prior accepted video as identity/performance context; use the canonical identity image only when no boundary exists.',
      'Use the same voice reference or voice ID for every spoken Devon line.',
    ],
    characters: {
      devon: {
        id: 'devon',
        name: 'Devon',
        age: 26,
        identityReferenceUrl: DEVON_IDENTITY_REFERENCE,
        identityElementId: process.env.PILOT_DEVON_IDENTITY_ELEMENT_ID || null,
        face:
          'warm olive skin, soft brown eyes, light stubble, oval face, straight medium-width nose, natural brows; identical age, bone structure, eye spacing, skin tone, and facial hair in every shot',
        hair: DEVON_HAIR,
        body: 'lean average-height build, relaxed shoulders, natural restrained gestures',
        wardrobe: DEVON_WARDROBE,
        voice: {
          description:
            'same warm mid-low American male voice in every episode, slight dry texture, relaxed pace around 145 words per minute, understated delivery, no announcer cadence',
          referenceUrl: process.env.PILOT_DEVON_VOICE_REFERENCE_URL || null,
          voiceId: process.env.PILOT_DEVON_VOICE_ID || null,
        },
      },
    },
  }
}

export function productionBibleFor(state?: PilotState | null): PilotProductionBible {
  return state?.productionBible || createProductionBible()
}

export function boundary(overrides: Partial<ShotBoundary> = {}): ShotBoundary {
  return {
    location: 'open-plan office at night',
    position: 'seated at his desk, torso angled slightly toward camera-right',
    facing: 'three-quarter profile toward camera-right',
    screenDirection: 'stationary',
    motion: 'breathing naturally, hands still',
    wardrobe: DEVON_WARDROBE,
    hair: DEVON_HAIR,
    props: ['phone on desk to his right', 'open laptop centered in front of him'],
    lighting: 'blue monitor glow on face with warm practical light behind him',
    camera: 'medium shot at eye level from the desk side of the 180-degree axis',
    expression: 'tired and undecided',
    ...overrides,
  }
}

export function shotContinuity(opts: {
  opening: ShotBoundary
  action: string
  closing: ShotBoundary
  transition?: ShotTransition
  dialogue?: SpokenLine | null
}): ShotContinuity {
  return {
    opening: structuredClone(opts.opening),
    action: opts.action.trim(),
    closing: structuredClone(opts.closing),
    transition: opts.transition || {
      mode: 'continuous',
      description: 'one unbroken take with no spatial or temporal jump',
    },
    dialogue: opts.dialogue ?? null,
  }
}

/** Backfill a useful contract for prototype episodes created before the ledger. */
export function continuityForOption(
  episode: PilotEpisode,
  option: PilotOption
): ShotContinuity {
  if (option.continuity) {
    const expectedOpening = episode.continuity?.closing || option.continuity.opening
    return {
      ...structuredClone(option.continuity),
      // The current episode's accepted final frame is authoritative even if a
      // stale pre-baked option was authored before a rerender/correction.
      opening: structuredClone(expectedOpening),
      transition: option.continuity.transition || {
        mode: 'continuous',
        description: 'one unbroken take with no spatial or temporal jump',
      },
    }
  }

  const opening = episode.continuity?.closing || boundary()
  const action = option.visualBeat?.trim() || option.label
  return shotContinuity({
    opening,
    action,
    closing: boundary({
      ...opening,
      position: `completing the choice: ${action}`,
      motion: 'settling after the action',
      expression: 'quietly committed to the choice',
    }),
  })
}

export function formatBoundary(frame: ShotBoundary): string {
  return [
    `location=${frame.location}`,
    `position=${frame.position}`,
    `facing=${frame.facing}`,
    `screen-direction=${frame.screenDirection}`,
    `motion=${frame.motion}`,
    `wardrobe=${frame.wardrobe}`,
    `hair=${frame.hair}`,
    `props=${frame.props.length ? frame.props.join('; ') : 'none'}`,
    `lighting=${frame.lighting}`,
    `camera=${frame.camera}`,
    `expression=${frame.expression}`,
  ].join(' | ')
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/** Exact-match fields that are not allowed to teleport at a clip boundary. */
export function boundaryViolations(
  priorClosing: ShotBoundary,
  nextOpening: ShotBoundary
): string[] {
  const violations: string[] = []
  const exact: Array<keyof Pick<
    ShotBoundary,
    'location' | 'position' | 'facing' | 'screenDirection' | 'motion' | 'wardrobe' | 'hair' | 'lighting' | 'camera' | 'expression'
  >> = [
    'location',
    'position',
    'facing',
    'screenDirection',
    'motion',
    'wardrobe',
    'hair',
    'lighting',
    'camera',
    'expression',
  ]

  for (const field of exact) {
    if (priorClosing[field] !== nextOpening[field]) violations.push(field)
  }
  if (!sameList(priorClosing.props, nextOpening.props)) violations.push('props')
  return violations
}

export function seasonContinuityViolations(state: PilotState): string[] {
  const issues: string[] = []
  for (let i = 1; i < state.episodes.length; i++) {
    const prior = state.episodes[i - 1]
    const next = state.episodes[i]
    if (!prior.continuity || !next.continuity) continue
    const fields = boundaryViolations(prior.continuity.closing, next.continuity.opening)
    if (fields.length) {
      issues.push(`${prior.id}->${next.id}: boundary mismatch in ${fields.join(', ')}`)
    }
  }
  return issues
}

/** A season may advance only from a rendered, pixel-backed shot boundary. */
export function continuityAdvanceBlocker(episode: PilotEpisode): string | null {
  if (episode.renderStatus !== 'done') {
    return `episode ${episode.number} render is ${episode.renderStatus}`
  }
  if (!episode.videoUrl) {
    return `episode ${episode.number} has no accepted video`
  }
  // Episode 1 is the imported legacy seed. Every generated episode after it
  // must carry a real extracted final frame before another vote can close.
  if (episode.number > 1 && !episode.lastFrameUrl) {
    return `episode ${episode.number} has no accepted exact final frame`
  }
  if (episode.continuityReview?.status !== 'ready') {
    const status = episode.continuityReview?.status || 'needed'
    return `episode ${episode.number} rendered ending has not passed observed-frame reconciliation (${status})`
  }
  return null
}

export function isScreenDirection(value: string): value is ScreenDirection {
  return [
    'camera-left',
    'camera-right',
    'toward-camera',
    'away-from-camera',
    'stationary',
  ].includes(value)
}

export function normalizeScreenDirection(value: string): ScreenDirection {
  return isScreenDirection(value) ? value : 'stationary'
}
