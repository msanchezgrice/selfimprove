import Anthropic from '@anthropic-ai/sdk'
import { boundary, normalizeScreenDirection, shotContinuity } from './continuity'
import { sanitizeForVideo } from './video-prompt'
import type {
  PilotEpisode,
  PilotProductionBible,
  ScreenDirection,
  ShotBoundary,
  ShotTransition,
} from './types'

type FrameInput = {
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  data: string
}

type ObservedFrameBoundary = Omit<ShotBoundary, 'screenDirection'> & {
  screen_direction: string
  confidence: number
  travel_phase: 'departing' | 'in-transit' | 'arriving' | 'stationary' | 'unclear'
  completed_actions: string[]
  evidence: string[]
}

type ReconciledOption = {
  label: string
  detail: string
  visual_beat: string
  stage_direction: string
  dialogue_text: string
  dialogue_delivery: string
  transition_mode: ShotTransition['mode']
  transition_description: string
  end_state: {
    location: string
    position: string
    facing: string
    screen_direction: string
    motion: string
    props: string[]
    lighting: string
    camera: string
    expression: string
  }
}

export type FrameReconciliation = {
  observed: ObservedFrameBoundary
  mismatches: string[]
  options: ReconciledOption[]
}

function optionText(option: ReconciledOption): string {
  return [
    option.label,
    option.detail,
    option.visual_beat,
    option.stage_direction,
    option.transition_description,
    option.end_state.location,
    option.end_state.position,
    option.end_state.motion,
  ].join(' ').toLowerCase()
}

/** Hard temporal postconditions that model prose is not allowed to override. */
export function temporalOptionViolations(result: FrameReconciliation): string[] {
  const observed = [
    result.observed.travel_phase,
    result.observed.motion,
    ...result.observed.completed_actions,
    ...result.observed.evidence,
  ].join(' ').toLowerCase()
  const arriving =
    result.observed.travel_phase === 'arriving' ||
    /\b(arriv|ascend|came up|coming up|emerg|reached the top|onto the street|onto the sidewalk)/i.test(
      observed
    )
  if (!arriving) return []

  const backwardTravel =
    /\b(descend|descending|go down|going down|down the stairs?|platform|turnstile|transit card|ride the|ride in|board (?:the )?train|subway bench)/i
  return result.options.flatMap((option, index) =>
    backwardTravel.test(optionText(option))
      ? [
          `option ${index + 1} reverses or repeats completed subway travel after an observed arrival: ${option.label}`,
        ]
      : []
  )
}

function arrivingFallback(observed: ObservedFrameBoundary, index: number): ReconciledOption {
  const shared = {
    dialogue_text: '',
    dialogue_delivery: '',
    transition_mode: 'continuous' as const,
  }
  if (index === 1) {
    return {
      ...shared,
      label: 'Text Sam from here 📱',
      detail: 'Pause aboveground before taking another step.',
      visual_beat: 'Devon clears the stairwell, steps safely aside, and types Sam a short message.',
      stage_direction: `Devon begins ${observed.position} at ${observed.location}, finishing the observed arrival. He steps fully clear of the stairwell without reversing, moves safely aside, and draws his phone. He types one short message to Sam, reads it once, and holds with his thumb above send.`,
      transition_description:
        'Continue the final arrival onto the adjacent street landing, then settle into a stationary phone beat without a cut.',
      end_state: {
        location: 'sidewalk beside the subway entrance',
        position: 'standing safely clear of the stairwell opening with both feet planted',
        facing: 'front three-quarter toward camera',
        screen_direction: 'stationary',
        motion: 'right thumb hovering above the phone send button',
        props: ['phone held in both hands at chest height', 'black watch on left wrist'],
        lighting: observed.lighting,
        camera: observed.camera,
        expression: 'careful, hopeful, and still deciding',
      },
    }
  }
  if (index === 2) {
    return {
      ...shared,
      label: 'Check the address 📍',
      detail: 'Make sure he surfaced on the right block.',
      visual_beat: 'Devon steps clear of the stairs and checks the destination on his phone.',
      stage_direction: `Devon begins ${observed.position} at ${observed.location}, finishing the observed arrival. He releases the railing, steps fully onto the sidewalk, and moves clear of the entrance. He checks the destination on his phone, turns his shoulders toward camera-right, and holds ready to continue aboveground.`,
      transition_description:
        'Continue the final upward arrival into one unbroken step onto the adjacent sidewalk.',
      end_state: {
        location: 'sidewalk beside the subway entrance',
        position: 'standing clear of the stairs with weight ready on the right foot',
        facing: 'three-quarter toward camera-right',
        screen_direction: 'camera-right',
        motion: 'lowering the phone and preparing to walk along the sidewalk',
        props: ['phone in right hand', 'black watch on left wrist'],
        lighting: observed.lighting,
        camera: observed.camera,
        expression: 'oriented and ready to move on',
      },
    }
  }
  return {
    ...shared,
    label: 'Continue aboveground 🚶',
    detail: 'Keep moving forward from the arrival.',
    visual_beat: 'Devon clears the final stair, releases the railing, and walks along the sidewalk.',
    stage_direction: `Devon begins ${observed.position} at ${observed.location}, finishing the observed arrival. He steps fully onto the street landing, releases the railing, and turns toward camera-right. He walks along the sidewalk without looking back, then holds mid-stride with the subway entrance receding behind him.`,
    transition_description:
      'Continue the final arrival into a same-direction sidewalk walk; no cut and no return belowground.',
    end_state: {
      location: 'sidewalk beyond the subway entrance',
      position: 'two strides past the stairwell with right foot leading',
      facing: 'profile toward camera-right',
      screen_direction: 'camera-right',
      motion: 'walking steadily away from the subway entrance',
      props: ['phone in trouser pocket', 'black watch on left wrist'],
      lighting: observed.lighting,
      camera: 'medium full profile shot on the street side of the stairwell axis',
      expression: 'resolved and moving forward',
    },
  }
}

/** Replace any model option that still violates a proven arrival boundary. */
export function repairTemporalOptionViolations(
  result: FrameReconciliation
): FrameReconciliation {
  const violations = temporalOptionViolations(result)
  if (!violations.length) return result
  const badIndexes = new Set(
    violations
      .map((violation) => Number(violation.match(/^option (\d+)/)?.[1]) - 1)
      .filter((index) => Number.isInteger(index) && index >= 0)
  )
  return {
    ...result,
    mismatches: [
      ...result.mismatches,
      ...violations.map((violation) => `guardrail repaired: ${violation}`),
    ],
    options: result.options.map((option, index) =>
      badIndexes.has(index) ? arrivingFallback(result.observed, index) : option
    ),
  }
}

const BOUNDARY_PROPERTIES = {
  location: { type: 'string' },
  position: { type: 'string' },
  facing: { type: 'string' },
  screen_direction: {
    type: 'string',
    enum: ['camera-left', 'camera-right', 'toward-camera', 'away-from-camera', 'stationary'],
  },
  motion: { type: 'string' },
  props: { type: 'array', items: { type: 'string' } },
  lighting: { type: 'string' },
  camera: { type: 'string' },
  expression: { type: 'string' },
}

const BOUNDARY_REQUIRED = [
  'location',
  'position',
  'facing',
  'screen_direction',
  'motion',
  'props',
  'lighting',
  'camera',
  'expression',
]

const RECONCILIATION_SCHEMA = {
  type: 'object',
  properties: {
    observed: {
      type: 'object',
      properties: {
        ...BOUNDARY_PROPERTIES,
        wardrobe: { type: 'string' },
        hair: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        travel_phase: {
          type: 'string',
          enum: ['departing', 'in-transit', 'arriving', 'stationary', 'unclear'],
        },
        completed_actions: { type: 'array', items: { type: 'string' } },
        evidence: { type: 'array', items: { type: 'string' } },
      },
      required: [
        ...BOUNDARY_REQUIRED,
        'wardrobe',
        'hair',
        'confidence',
        'travel_phase',
        'completed_actions',
        'evidence',
      ],
    },
    mismatches: { type: 'array', items: { type: 'string' } },
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          detail: { type: 'string' },
          visual_beat: { type: 'string' },
          stage_direction: { type: 'string' },
          dialogue_text: { type: 'string' },
          dialogue_delivery: { type: 'string' },
          transition_mode: {
            type: 'string',
            enum: ['continuous', 'match-on-action', 'time-bridge'],
          },
          transition_description: { type: 'string' },
          end_state: {
            type: 'object',
            properties: BOUNDARY_PROPERTIES,
            required: BOUNDARY_REQUIRED,
          },
        },
        required: [
          'label',
          'detail',
          'visual_beat',
          'stage_direction',
          'dialogue_text',
          'dialogue_delivery',
          'transition_mode',
          'transition_description',
          'end_state',
        ],
      },
    },
  },
  required: ['observed', 'mismatches', 'options'],
}

let client: Anthropic | null = null

function getClient() {
  client ||= new Anthropic()
  return client
}

/**
 * Observe the actual end of a rendered clip and author the next vote packages
 * from that evidence. Frames must be chronological and sampled near the end.
 */
export async function reconcileRenderedFrames(opts: {
  episode: PilotEpisode
  frames: FrameInput[]
  productionBible: PilotProductionBible
}): Promise<FrameReconciliation> {
  if (opts.frames.length < 2 || opts.frames.length > 3) {
    throw new Error('pilot reconciliation requires two or three chronological end frames')
  }

  const devon = opts.productionBible.characters.devon
  const planned = opts.episode.continuity?.closing
  const priorOptions = opts.episode.options.map((option) => ({
    label: option.label,
    detail: option.detail,
    visualBeat: option.visualBeat,
    stageDirection: option.stageDirection,
  }))

  const content: Anthropic.Messages.ContentBlockParam[] = opts.frames.map((frame) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: frame.mediaType,
      data: frame.data,
    },
  }))
  content.push({
    type: 'text',
    text: [
      `You are the script supervisor for Episode ${opts.episode.number} of Patch Notes.`,
      `The images are chronological frames from the final ~1.5 seconds of the ACTUAL rendered video; the last image is the accepted final frame. Pixels outrank the screenplay.`,
      `Episode title: ${opts.episode.title}`,
      `Episode script: ${opts.episode.script}`,
      `Planned final boundary: ${JSON.stringify(planned)}`,
      `Previously proposed choices (rewrite any that no longer follow): ${JSON.stringify(priorOptions)}`,
      `Known character: ${devon.name}; canonical identity ${devon.face}; canonical hair ${devon.hair}.`,
      `Infer motion only from changes across the chronological frames. If direction is ambiguous, use stationary/unclear instead of guessing.`,
      `Classify whether Devon is departing, in transit, arriving, stationary, or unclear. List actions already completed on screen.`,
      `Then write exactly three mutually exclusive NEXT actions that move story time forward from the actual final frame.`,
      `Temporal guardrails: never repeat travel/action already completed; never describe descending if he visibly arrived upward; never offer riding if the ride is already complete; never reset him to an earlier location.`,
      `DEFINITION: travel_phase=arriving means the prior travel is complete. Every option must move away from that origin into a genuinely later beat. It is invalid to descend, return to the platform, use a turnstile, board, or ride after an arrival at street level.`,
      `A reversal is allowed only as an explicit choice whose label and first action show him physically turning around. At most one reversal choice.`,
      `Each stage direction must be 45-70 words: begin by restating the observed pose/location/motion, show one reachable action, then hold a precise end pose.`,
      `Every option is filmable in ten seconds. Use continuous only within a directly reachable space. Use match-on-action for one motivated cut. Use time-bridge only for new travel that visibly shows departure, transit, and arrival.`,
      `Preserve the wardrobe, hair, visible props, hand occupancy, 180-degree axis, and travel direction seen in the final frame unless the action visibly changes them.`,
      `No fades, time reversal, teleporting, repeated commute beats, new people, weapons, or violence. Keep grounded PG life comedy.`,
      `Do not identify the actor. Describe only the fictional character and visible evidence.`,
    ].join('\n'),
  })

  let repairFeedback = ''
  let lastResult: FrameReconciliation | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptContent: Anthropic.Messages.ContentBlockParam[] = repairFeedback
      ? [
          ...content,
          {
            type: 'text',
            text: `Your prior draft failed deterministic temporal validation:\n${repairFeedback}\nRewrite all three options. Do not reinterpret the observed arrival as a departure.`,
          },
        ]
      : content
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 5000,
      temperature: 0,
      messages: [{ role: 'user', content: attemptContent }],
      tools: [
        {
          name: 'reconcile_rendered_boundary',
          description:
            'Record the observed final boundary and three temporally coherent next camera packages.',
          input_schema: RECONCILIATION_SCHEMA as Anthropic.Messages.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool', name: 'reconcile_rendered_boundary' },
    })

    const tool = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
    )
    if (!tool) throw new Error('pilot reconciliation returned no structured result')
    const result = tool.input as FrameReconciliation
    lastResult = result
    const violations = temporalOptionViolations(result)
    if (!violations.length) return result
    repairFeedback = violations.join('\n')
  }

  if (lastResult) {
    const repaired = repairTemporalOptionViolations(lastResult)
    const remaining = temporalOptionViolations(repaired)
    if (!remaining.length) return repaired
    repairFeedback = remaining.join('\n')
  }
  throw new Error(`pilot reconciliation remained temporally incoherent: ${repairFeedback}`)
}

function nonempty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/** Apply a reviewed observation without allowing model output to omit locks. */
export function applyFrameReconciliation(opts: {
  episode: PilotEpisode
  result: FrameReconciliation
  productionBible: PilotProductionBible
  lastFrameUrl: string
  observedAt?: string
}) {
  const { episode, result } = opts
  if (result.options.length !== 3) {
    throw new Error('pilot reconciliation must return exactly three options')
  }
  const fallback = episode.continuity?.closing || boundary()
  const observed: ShotBoundary = boundary({
    ...fallback,
    location: nonempty(result.observed.location, fallback.location),
    position: nonempty(result.observed.position, fallback.position),
    facing: nonempty(result.observed.facing, fallback.facing),
    screenDirection: normalizeScreenDirection(result.observed.screen_direction),
    motion: nonempty(result.observed.motion, fallback.motion),
    wardrobe: nonempty(result.observed.wardrobe, fallback.wardrobe),
    hair: nonempty(result.observed.hair, fallback.hair),
    props: result.observed.props.length ? result.observed.props : fallback.props,
    lighting: nonempty(result.observed.lighting, fallback.lighting),
    camera: nonempty(result.observed.camera, fallback.camera),
    expression: nonempty(result.observed.expression, fallback.expression),
  })

  if (episode.continuity) episode.continuity.closing = structuredClone(observed)

  const existingIds = episode.options.slice(0, 3).map((option, index) =>
    option.id || ['a', 'b', 'c'][index]
  )
  episode.options = result.options.map((candidate, index) => {
    const end = candidate.end_state
    const dialogueText = candidate.dialogue_text.trim()
    return {
      id: existingIds[index] || ['a', 'b', 'c'][index],
      label: candidate.label.trim().slice(0, 60),
      detail: candidate.detail.trim().slice(0, 140),
      votes: 0,
      visualBeat: sanitizeForVideo(candidate.visual_beat).slice(0, 180),
      stageDirection: sanitizeForVideo(candidate.stage_direction).slice(0, 900),
      continuity: shotContinuity({
        opening: observed,
        action: sanitizeForVideo(candidate.visual_beat),
        closing: boundary({
          ...observed,
          location: nonempty(end.location, observed.location),
          position: nonempty(end.position, observed.position),
          facing: nonempty(end.facing, observed.facing),
          screenDirection: normalizeScreenDirection(end.screen_direction),
          motion: nonempty(end.motion, observed.motion),
          props: end.props.length ? end.props : observed.props,
          lighting: nonempty(end.lighting, observed.lighting),
          camera: nonempty(end.camera, observed.camera),
          expression: nonempty(end.expression, observed.expression),
          // Clothing and hair cannot silently reset inside a proposed action.
          wardrobe: observed.wardrobe,
          hair: observed.hair,
        }),
        transition: {
          mode: candidate.transition_mode,
          description: sanitizeForVideo(candidate.transition_description),
        },
        dialogue: dialogueText
          ? {
              text: sanitizeForVideo(dialogueText).slice(0, 100),
              delivery:
                sanitizeForVideo(candidate.dialogue_delivery).slice(0, 140) ||
                'natural and understated',
            }
          : null,
      }),
    }
  })

  episode.lastFrameUrl = opts.lastFrameUrl
  episode.posterUrl = opts.lastFrameUrl
  episode.continuityReview = {
    status: 'ready',
    observedAt: opts.observedAt || new Date().toISOString(),
    confidence: Math.max(0, Math.min(1, result.observed.confidence)),
    travelPhase: result.observed.travel_phase,
    completedActions: result.observed.completed_actions.map((item) => item.trim()).filter(Boolean),
    mismatches: result.mismatches.map((item) => item.trim()).filter(Boolean),
    evidence: result.observed.evidence.map((item) => item.trim()).filter(Boolean),
    error: null,
  }
}

export function continuityReviewNeeded(episode: PilotEpisode): boolean {
  return episode.renderStatus === 'done' && Boolean(episode.videoUrl) &&
    episode.continuityReview?.status !== 'ready'
}

export function observedScreenDirection(value: string): ScreenDirection {
  return normalizeScreenDirection(value)
}
