/**
 * Image-to-video continuity for Patch Notes.
 *
 * Loop: seed video → audience chooses → render next clip.
 * Character consistency is the product: every job gets the same Devon identity
 * anchor plus the exact prior boundary and performance references.
 *
 * Safety: video models literalize metaphors ("finger-guns" → real guns).
 * Always sanitize action/stage text before sending to the video model.
 */

import { createProductionBible, formatBoundary } from './continuity'
import type { PilotProductionBible, ShotContinuity } from './types'

/** Phrases video models misread as real violence / weapons. */
const UNSAFE_PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /\bfinger[- ]?guns?\b/gi, replace: 'an awkward friendly wave' },
  { re: /\bguns?\s+blazing\b/gi, replace: 'full awkward energy' },
  { re: /\b(shoot|shoots|shooting|shot)\b/gi, replace: 'points playfully' },
  { re: /\b(gun|guns|pistol|rifle|firearm|weapon|weapons)\b/gi, replace: 'phone' },
  { re: /\b(kill|kills|killing|murder|stab|stabbing|blood|bloody)\b/gi, replace: 'awkward' },
  { re: /\b(explode|explosion|bomb|grenade)\b/gi, replace: 'surprise' },
  { re: /\b(punch|punches|fight|fights|fighting|assault)\b/gi, replace: 'nervous gesture' },
  { re: /\bfade[- ]?in\b/gi, replace: 'match cut begins' },
  { re: /\bfade[- ]?out\b/gi, replace: 'hold the final frame' },
]

export function sanitizeForVideo(text: string): string {
  let out = text
  for (const { re, replace } of UNSAFE_PATTERNS) {
    out = out.replace(re, replace)
  }
  return out.replace(/\s+/g, ' ').trim()
}

export function buildCoherentVideoPrompt(opts: {
  script: string
  mood: string
  visualBeat?: string | null
  /** Full cinematic stage direction from the writer */
  stageDirection?: string | null
  settingHint?: string | null
  continuing?: boolean
  continuity?: ShotContinuity | null
  productionBible?: PilotProductionBible | null
  hasIdentityImageReference?: boolean
  hasPreviousVideoReference?: boolean
  hasVoiceReference?: boolean
}): string {
  const bible = opts.productionBible || createProductionBible()
  const devon = bible.characters.devon
  const rawAction = extractDevonAction(opts.script, opts.visualBeat)
  const action = sanitizeForVideo(opts.continuity?.action || rawAction)
  const opening = opts.continuity?.opening
  const closing = opts.continuity?.closing
  const setting =
    opts.settingHint?.trim() ||
    (opening || closing
      ? `${opening?.location || ''}${opening && closing ? ' through ' : ''}${closing?.location || ''}`
      : null) ||
    inferSetting(opts.script) ||
    'dim warm interior, shallow depth of field'

  const stage = sanitizeForVideo(
    opts.stageDirection?.trim() ||
      `Devon ${action.replace(/^Devon\s+/i, '')}. Hold on his face at the end.`
  )

  const dialogue = opts.continuity?.dialogue
  const transition = opts.continuity?.transition || {
    mode: 'continuous' as const,
    description: 'one unbroken take with no spatial or temporal jump',
  }
  const audio = inferAudio(
    opening || closing
      ? `${opening?.location || ''} ${closing?.location || ''}`
      : opts.script,
    opts.mood
  )

  const identitySource = opts.hasIdentityImageReference === false
    ? 'the exact start frame and previous episode video'
    : 'the canonical identity image'
  const identityReference = [
    `Devon is the SAME person as ${identitySource}: age ${devon.age}; ${devon.face}; ${devon.body}.`,
    `HAIR LOCK: ${devon.hair}.`,
    `Do not reinterpret his face from text; copy identity geometry from the supplied visual reference.`,
  ].join(' ')

  const referenceInstruction = opts.hasPreviousVideoReference
    ? 'Use the previous episode video as motion, performance, lighting, and voice context. Continue it; do not remake or summarize it.'
    : 'No prior video reference is available; obey the structured opening boundary exactly.'

  const voiceInstruction = dialogue
    ? [
        opts.hasVoiceReference
          ? 'VOICE LOCK: match the supplied Devon voice reference exactly.'
          : opts.hasPreviousVideoReference
            ? 'VOICE LOCK: match Devon\'s vocal identity, pitch, cadence, accent, and texture from the previous episode video.'
          : `VOICE LOCK: preserve this immutable voice profile: ${devon.voice.description}.`,
        `Devon says exactly: "${sanitizeForVideo(dialogue.text)}". Delivery: ${sanitizeForVideo(dialogue.delivery)}.`,
        'Accurate natural lip sync. No other voice speaks. Do not paraphrase or add words.',
      ].join(' ')
    : 'Devon does not speak in this clip. No voiceover and no off-camera dialogue.'

  const transitionInstruction =
    transition.mode === 'continuous'
      ? `CONTINUOUS TAKE: no internal cut. ${transition.description}.`
      : transition.mode === 'match-on-action'
        ? `TWO-SHOT MATCH CUT: cut once on the described body/prop motion. The second shot begins on the same limb position, motion vector, screen direction, wardrobe, hair, and props. ${transition.description}.`
        : `VISIBLE TIME BRIDGE: use exactly three short shots — departure from the opening boundary, a readable travel/time bridge, then arrival into the final action. Preserve Devon's identity, wardrobe, hair, props, and direction across every cut. ${transition.description}.`

  return [
    // Identity and boundary constraints come first because models overweight early tokens.
    `IDENTITY LOCK: ${identityReference}`,
    `REFERENCE CONTRACT: ${referenceInstruction}`,
    opening
      ? `FRAME 0 MATCH: begin on this exact boundary with no establishing reset and no fade: ${formatBoundary(opening)}.`
      : `FRAME 0: animate the supplied start image exactly; no establishing reset and no fade.`,
    `WARDROBE LOCK: ${opening?.wardrobe || devon.wardrobe}. Do not change, restyle, recolor, remove, or add clothing.`,
    `Vertical 9:16, 10 seconds. The cut from the prior episode is a hard match cut.`,
    `EDITING CONTRACT: ${transitionInstruction}`,
    `SUBJECT ACTION: ${action}. ${stage.slice(0, 280)}`,
    `SETTING: ${setting}. Preserve every visible prop and its hand/side placement until the action moves it on camera.`,
    opening
      ? `CAMERA AXIS: start with ${opening.camera}; preserve ${opening.screenDirection} travel and the 180-degree axis. Do not reverse screen direction.`
      : `CAMERA: grounded medium shot that keeps Devon's face, hands, and travel direction readable.`,
    `PERFORMANCE: mood ${opts.mood}; grounded micro-expressions and natural body weight, never trailer acting.`,
    `DIALOGUE AND VOICE: ${voiceInstruction}`,
    `AMBIENCE: ${audio}`,
    closing
      ? `FINAL FRAME LOCK: arrive at this exact boundary by second 9 and hold it for the final 0.75 seconds: ${formatBoundary(closing)}.`
      : `FINAL FRAME: settle on a readable face, body, prop, and motion state for the final 0.75 seconds.`,
    `STRICT: identical face, hair, facial hair, body proportions, wardrobe, and voice; no morphing, teleporting, prop duplication, extra fingers, new people, text, logos, subtitles, unplanned montage, unmotivated time jump, fade, or camera-axis reversal.`,
    `CONTENT: PG workplace comedy ONLY — no weapons, no guns, no shooting, no violence, no blood, no crime.`,
  ].join(' ')
}

function inferSetting(script: string): string | null {
  const s = script.toLowerCase()
  if (s.includes('office') || s.includes('desk') || s.includes('ticket')) {
    return 'dim open-plan office at night, blue monitor glow'
  }
  if (s.includes('lucho') || s.includes('bar') || s.includes('drink') || s.includes('beer')) {
    return 'neighborhood bar, warm amber lights, soft crowd bokeh'
  }
  if (s.includes('street') || s.includes('outside') || s.includes('jacket')) {
    return 'night sidewalk, cool streetlight, light traffic bokeh'
  }
  if (s.includes('gym')) {
    return 'quiet gym interior, cool overhead lights'
  }
  return null
}

function inferAudio(script: string, mood: string): string {
  const s = script.toLowerCase()
  if (s.includes('lucho') || s.includes('bar') || s.includes('drink')) {
    return 'diegetic bar ambience — low chatter, glasses, distant music; no voiceover'
  }
  if (s.includes('office') || s.includes('desk') || s.includes('ticket')) {
    return 'quiet office night tone — soft HVAC, distant keyboard, phone buzz; no voiceover'
  }
  if (s.includes('street') || s.includes('outside')) {
    return 'night street ambience — distant traffic, footsteps; no voiceover'
  }
  if (s.includes('gym')) {
    return 'quiet gym ambience — weights clink faintly; no voiceover'
  }
  return `natural diegetic room tone matching mood "${mood}"; no voiceover, no music score`
}

function extractDevonAction(script: string, visualBeat?: string | null): string {
  const beat = visualBeat?.trim()
  if (beat) {
    return `Devon ${beat.replace(/^devon\s+/i, '')}`
  }

  const spoken = script.match(
    /Devon[^.!]{0,40}(?:grins|says|goes|exhales|asks|pulls|nods|sips|laughs|looks|waves|smiles|slides)[^.!]{0,80}[.!]/i
  )
  if (spoken) {
    return sanitizeForVideo(spoken[0].replace(/\s+/g, ' ').trim())
  }

  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
  // Prefer a sentence that isn't the unsafe metaphor line.
  const safe =
    sentences.find(
      (s) =>
        /\bDevon\b/i.test(s) &&
        !/\bfinger[- ]?gun|shoot|gun|weapon/i.test(s)
    ) ||
    sentences.find((s) => /^Devon\b/i.test(s)) ||
    sentences.find((s) => /\bDevon\b/i.test(s)) ||
    sentences[0] ||
    'Devon reacts quietly, eyes adjusting to what just happened'

  return sanitizeForVideo(safe.slice(0, 160))
}
