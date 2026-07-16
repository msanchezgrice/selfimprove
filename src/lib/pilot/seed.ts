import type { PilotEpisode, PilotOption, PilotState, ShotBoundary } from './types'
import {
  boundary,
  continuityForOption,
  createProductionBible,
  DEVON_IDENTITY_REFERENCE,
  productionBibleFor,
  shotContinuity,
} from './continuity'

/**
 * Patch Notes continuity model:
 *   seed video (Ep 1) → audience chooses a LOCKED camera package → render
 * Character consistency is the product. Each render receives separate identity,
 * exact boundary-frame, prior-performance, and voice references.
 */

/** Canonical still of Devon — identity lock for image-to-video. */
export const DEVON_SEED_IMAGE =
  DEVON_IDENTITY_REFERENCE

/** Opening seed video — Episode 1. The season starts here. */
export const DEVON_SEED_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_3CRsmmUcswTHKARjqkkx1XlBGHU/hf_20260715_210005_1751f566-3d4e-49e9-a99b-e21d5f9c45f0.mp4'

/**
 * Continuity inputs for rendering episode N.
 * Identity lock: always the canonical Devon identity reference.
 * Shot lock: use the exact prior accepted final frame when it exists.
 */
export function continuityForEpisode(
  state: PilotState,
  episode: PilotEpisode
): {
  previousVideoUrl: string
  identityImageUrl: string
  startImageUrl: string
  voiceReferenceUrl: string | null
  previousEpisodeId: string | null
} {
  const prior = state.episodes
    .filter((e) => e.number < episode.number && e.videoUrl)
    .sort((a, b) => b.number - a.number)[0]

  const devon = productionBibleFor(state).characters.devon

  return {
    previousVideoUrl: prior?.videoUrl || DEVON_SEED_VIDEO,
    identityImageUrl: devon.identityReferenceUrl || DEVON_SEED_IMAGE,
    // A poster/thumbnail is not necessarily the final frame. Only use the
    // exact extracted boundary frame; otherwise let Seedance use identity +
    // previous-video references rather than pretending a thumbnail is canon.
    startImageUrl: prior?.lastFrameUrl || DEVON_SEED_IMAGE,
    voiceReferenceUrl: devon.voice.referenceUrl || null,
    previousEpisodeId: prior?.id ?? null,
  }
}

export function seedState(): PilotState {
  const now = new Date().toISOString()
  const opening = boundary({
    expression: 'weary concentration',
    motion: 'typing slowly, then pausing as the phone buzzes',
  })
  const closing = boundary({
    position: 'seated at his desk with left hand near the laptop and right hand beside the phone',
    facing: 'three-quarter profile toward camera-right, eyes moving from phone to laptop',
    motion: 'finishing a glance from the phone back to the unfinished ticket',
    expression: 'caught between responsibility and wanting a life',
  })

  return {
    character: {
      name: 'Devon',
      job: 'Junior analyst',
      savings: 6130,
      energy: 54,
      social: 'Sam: 19 days silent',
      mood: 'Restless',
    },
    productionBible: createProductionBible(),
    episodes: [
      {
        id: 'ep-1',
        number: 1,
        title: 'One More Ticket',
        logline:
          "6:40pm. Devon's still at his desk. The group chat is at Lucho's without him.",
        script:
          "Dim office, night. Devon's phone buzzes — a voice note from Marcus: \"Dev. We're at Lucho's. Come through, don't be boring.\" Devon looks from the phone to the wall of unfinished tickets. \"One more ticket... or one good night.\"",
        videoPrompt: '',
        videoUrl: DEVON_SEED_VIDEO,
        posterUrl: DEVON_SEED_IMAGE,
        lastFrameUrl: null,
        renderStatus: 'done',
        hfRequestId: null,
        options: [
          {
            id: 'a',
            label: "Go to Lucho's 🍻",
            detail: 'The group chat wins. Social +, Energy −, Savings −$60',
            visualBeat:
              'grabs his jacket off the chair, pockets his phone mid-buzz, and walks toward the office exit',
            stageDirection:
              'Fade in on Devon at his desk under monitor glow. He reads the group chat, exhales, stands, pulls on his jacket, and walks toward the dark office door. Hold on his face in the doorway for the fade-out.',
            continuity: shotContinuity({
              opening: closing,
              action:
                'Devon pockets his phone, stands, puts on his jacket, and walks away from camera toward the office exit',
              closing: boundary({
                location: 'open-plan office at the exit doorway',
                position: 'standing inside the open doorway with his left foot crossing the threshold',
                facing: 'back three-quarter view, head turned slightly toward camera-left',
                screenDirection: 'away-from-camera',
                motion: 'walking through the doorway without stopping',
                props: ['phone in right trouser pocket', 'jacket worn over slate-blue overshirt'],
                camera: 'medium full shot at eye level, same side of the office axis',
                expression: 'relieved but a little guilty',
              }),
            }),
            votes: 0,
          },
          {
            id: 'b',
            label: 'Hit the gym 🏋️',
            detail: 'Discipline arc continues. Energy +, Social −',
            visualBeat:
              'closes the laptop, stands, and swings a gym bag onto his shoulder under the office lights',
            stageDirection:
              'Fade in on Devon ignoring another group-chat buzz. He shuts the laptop, stands, hooks a gym bag over one shoulder, and turns toward the elevators. End on his determined face.',
            continuity: shotContinuity({
              opening: closing,
              action:
                'Devon shuts the laptop, stands, lifts the gym bag with his right hand, and walks camera-right toward the elevators',
              closing: boundary({
                location: 'office elevator lobby at night',
                position: 'standing one step from the elevator call button with gym bag on right shoulder',
                facing: 'profile toward camera-right',
                screenDirection: 'camera-right',
                motion: 'reaching with left index finger toward the elevator button',
                props: ['gym bag on right shoulder', 'phone in left trouser pocket'],
                camera: 'medium shot at eye level, preserving left-to-right travel',
                expression: 'quietly determined',
              }),
            }),
            votes: 0,
          },
          {
            id: 'c',
            label: 'One more ticket 💻',
            detail: 'Grind. Boss notices? Energy −−, Career +?',
            visualBeat:
              'silences the group chat, cracks his knuckles, and leans back into the glowing monitor',
            stageDirection:
              'Fade in on the buzzing phone. Devon flips it face-down, rolls his shoulders, cracks his knuckles, and leans into the ticket on screen. Close on his tired face lit by the monitor.',
            continuity: shotContinuity({
              opening: closing,
              action:
                'Devon flips the phone face-down, rolls his shoulders, and leans toward the open laptop',
              closing: boundary({
                position: 'seated close to the desk with both forearms beside the laptop keyboard',
                facing: 'three-quarter profile toward camera-right, eyes fixed on laptop',
                screenDirection: 'stationary',
                motion: 'typing steadily with both hands',
                props: ['phone face-down on desk to his right', 'open laptop centered in front of him'],
                expression: 'tired focus with jaw gently set',
              }),
            }),
            votes: 0,
          },
        ],
        winnerOptionId: null,
        continuity: shotContinuity({
          opening,
          action:
            'Devon pauses at his desk when the phone buzzes and looks between the invitation and the unfinished ticket',
          closing,
          dialogue: {
            text: 'One more ticket... or one good night.',
            delivery: 'quiet, dry, almost to himself',
          },
        }),
        createdAt: now,
      },
    ],
    voters: {},
    lastCycleAt: null,
  }
}

function inferLegacyClosingBoundary(
  opening: ShotBoundary,
  option: PilotOption,
  state: PilotState
): ShotBoundary {
  const text = `${option.label} ${option.visualBeat || ''} ${option.stageDirection || ''}`.toLowerCase()
  const intent = `${option.label} ${option.visualBeat || ''}`.toLowerCase()
  const devon = productionBibleFor(state).characters.devon

  if (
    /window|glass/.test(text) &&
    !/alley|back entrance|door|walk in|enter|text|phone|types|send/.test(intent)
  ) {
    return boundary({
      ...opening,
      location: "sidewalk outside Lucho's front window at night",
      position: 'leaning toward the window with right shoulder closest to the glass',
      facing: 'profile toward camera-left, eyes scanning through the glass',
      screenDirection: 'stationary',
      motion: 'pulling back half an inch from the window after recognizing Sam',
      wardrobe: devon.wardrobe,
      hair: devon.hair,
      props: ['right hand cupped against window glass', 'phone in left trouser pocket'],
      lighting: 'cool streetlight behind him and warm amber bar light through the glass',
      camera: 'medium profile shot from the sidewalk side of the bar-front axis',
      expression: 'careful recognition and hurt held in check',
    })
  }

  if (/alley|back entrance/.test(text)) {
    return boundary({
      ...opening,
      location: "mouth of the alley beside Lucho's at night",
      position: 'mid-step entering the alley with left foot forward',
      facing: 'back three-quarter view toward camera-right',
      screenDirection: 'camera-right',
      motion: 'continuing into the alley without stopping',
      wardrobe: devon.wardrobe,
      hair: devon.hair,
      props: ['phone in left trouser pocket'],
      lighting: 'warm bar spill falling away into cool alley light',
      camera: 'medium full shot preserving left-to-right sidewalk travel',
      expression: 'nervous calculation',
    })
  }

  if (/door|walk in|enter/.test(text)) {
    const atBar = /lucho|bar|front door/.test(text)
    return boundary({
      ...opening,
      location: atBar ? "Lucho's front-door threshold at night" : opening.location,
      position: atBar
        ? 'left foot across the open bar threshold, right hand still on the door handle'
        : 'crossing the doorway without stopping',
      facing: 'back three-quarter view moving away from camera',
      screenDirection: 'away-from-camera',
      motion: 'continuing forward through the doorway',
      wardrobe: devon.wardrobe,
      hair: devon.hair,
      props: ['phone in right trouser pocket', ...(atBar ? ['right hand on bar door handle'] : [])],
      lighting: atBar
        ? 'cool streetlight behind him and warm amber bar light ahead'
        : opening.lighting,
      camera: 'medium full shot on the same side of the doorway axis',
      expression: 'resolved nerves',
    })
  }

  if (/text|phone|types|send/.test(text)) {
    const atBar = /lucho|bar|sidewalk|window/.test(text) || opening.location.includes("Lucho")
    return boundary({
      ...opening,
      location: atBar ? "sidewalk outside Lucho's at night" : opening.location,
      position: 'standing still with phone held at chest height in both hands',
      facing: 'three-quarter view toward camera-left, eyes on phone',
      screenDirection: 'stationary',
      motion: 'lowering both thumbs just after sending the text',
      wardrobe: devon.wardrobe,
      hair: devon.hair,
      props: ['phone held in both hands at chest height'],
      lighting: atBar
        ? 'cool streetlight with warm bar light edging his face'
        : opening.lighting,
      camera: 'medium shot from the same side of the established axis',
      expression: 'immediate second thoughts',
    })
  }

  return boundary({
    ...opening,
    position: `completing the choice: ${option.visualBeat || option.label}`,
    motion: option.visualBeat || 'settling after the chosen action',
    wardrobe: devon.wardrobe,
    hair: devon.hair,
    expression: 'committed to the choice',
  })
}

function inferLegacyOptionContinuity(
  state: PilotState,
  episode: PilotEpisode,
  option: PilotOption
) {
  const opening = episode.continuity?.closing || boundary()
  const closing = inferLegacyClosingBoundary(opening, option, state)
  const sameLuchosExterior =
    /Lucho|bar|sidewalk|alley/i.test(opening.location) &&
    /Lucho|bar|sidewalk|alley/i.test(closing.location)
  const needsTravelBridge = opening.location !== closing.location && !sameLuchosExterior
  const rawAction = option.visualBeat?.trim() || option.label

  return shotContinuity({
    opening,
    action: needsTravelBridge
      ? `Devon continues from ${opening.position}; a visible travel bridge preserves his motion and wardrobe; then ${rawAction.replace(/^Devon\s+/i, '')}`
      : rawAction,
    closing,
    transition: needsTravelBridge
      ? {
          mode: 'time-bridge',
          description:
            'Match Devon\'s leading foot and travel direction out of the prior space, show a brief night-street travel beat, then continue the same stride into the destination.',
        }
      : {
          mode: 'continuous',
          description: 'continue directly from the prior held pose in the same reachable space',
        },
  })
}

/** Normalize an audience write-in into the same boundary contract as authored options. */
export function continuityForWriteIn(
  state: PilotState,
  episode: PilotEpisode,
  option: PilotOption
) {
  return inferLegacyOptionContinuity(state, episode, option)
}

/**
 * Upgrade persisted prototype seasons in memory. Existing JSON state predates
 * the production bible and shot ledger; this keeps the current story usable
 * without resetting votes or episodes. The next successful mutation persists
 * the upgraded structure.
 */
export function upgradePilotState(state: PilotState): PilotState {
  const canonical = seedState()
  state.productionBible ||= canonical.productionBible

  for (let index = 0; index < state.episodes.length; index++) {
    const episode = state.episodes[index]

    if (index === 0) {
      const canonicalFirst = canonical.episodes[0]
      episode.continuity ||= structuredClone(canonicalFirst.continuity)
      for (const option of episode.options) {
        const canonicalOption = canonicalFirst.options.find((candidate) => candidate.id === option.id)
        option.continuity ||= structuredClone(canonicalOption?.continuity)
      }
    } else if (!episode.continuity) {
      const prior = state.episodes[index - 1]
      const winner = prior.options.find((option) => option.id === prior.winnerOptionId)
      if (winner) episode.continuity = continuityForOption(prior, winner)
    }

    if (episode.continuity && !episode.continuity.transition) {
      episode.continuity.transition = {
        mode: 'continuous',
        description: 'one unbroken take with no spatial or temporal jump',
      }
    }

    for (const option of episode.options) {
      option.continuity ||= inferLegacyOptionContinuity(state, episode, option)
      if (option.continuity && !option.continuity.transition) {
        option.continuity.transition = {
          mode: 'continuous',
          description: 'continue directly from the prior held pose in the same reachable space',
        }
      }
    }
  }

  return state
}
