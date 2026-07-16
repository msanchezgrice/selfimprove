/**
 * Image-to-video continuity for Patch Notes.
 *
 * Loop: seed video → audience chooses → render next clip.
 * Identity lock: always the same Devon (seed face / previous last frame).
 * Action changes with the winning choice; the face should not.
 */

const DEVON_LOOK =
  'Devon, 26, short curly brown hair, light stubble — SAME person as the reference / previous clip'

export function buildCoherentVideoPrompt(opts: {
  script: string
  mood: string
  /** Audience/director note — what we should SEE if this choice won */
  visualBeat?: string | null
  settingHint?: string | null
  /** True when continuing from a previous episode frame (not cold seed) */
  continuing?: boolean
}): string {
  const action = extractDevonAction(opts.script, opts.visualBeat)
  const setting =
    opts.settingHint?.trim() ||
    inferSetting(opts.script) ||
    'dim warm bar interior, shallow depth of field, soft amber practical lights'

  const continuity = opts.continuing
    ? `Continue from the reference frame of the previous episode. Keep Devon's face, hair, wardrobe continuity, and age identical — only the action and micro-expression change.`
    : `Start from the reference photo of ${DEVON_LOOK}. This is the season identity lock.`

  return [
    `Vertical 9:16, 10-second single continuous shot, cinematic, no cuts.`,
    continuity,
    `SETTING: ${setting}.`,
    `ACTION (this night's choice, on Devon): ${action}`,
    `Camera: medium close-up on Devon, face and upper body; other people off-frame or soft bokeh only.`,
    `Performance: mood is "${opts.mood}" — subtle, grounded, natural. No melodrama.`,
    `STRICT: no legible text on any phone, screen, sign, or glass; no subtitles; no logos.`,
    `End held on Devon's face — this last frame becomes the start of tomorrow's episode.`,
  ].join(' ')
}

function inferSetting(script: string): string | null {
  const s = script.toLowerCase()
  if (s.includes('office') || s.includes('desk') || s.includes('ticket')) {
    return 'dim open-plan office at night, blue monitor glow, empty desks'
  }
  if (s.includes('lucho') || s.includes('bar') || s.includes('drink') || s.includes('beer')) {
    return 'crowded neighborhood bar, warm amber lights, soft background crowd blur'
  }
  if (s.includes('street') || s.includes('outside') || s.includes('jacket')) {
    return 'night sidewalk outside a bar, cool sodium streetlight, light traffic bokeh'
  }
  return null
}

function extractDevonAction(script: string, visualBeat?: string | null): string {
  const beat = visualBeat?.trim()
  if (beat) {
    return `Devon ${beat.replace(/^devon\s+/i, '')}`
  }

  const spoken = script.match(
    /Devon[^.!]{0,40}(?:grins|says|goes|exhales|asks|pulls|nods|sips|laughs|looks)[^.!]{0,80}[.!]/i
  )
  if (spoken) {
    return spoken[0].replace(/\s+/g, ' ').trim()
  }

  const sentences = script
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
  const devonFirst =
    sentences.find((s) => /^Devon\b/i.test(s)) ||
    sentences.find((s) => /\bDevon\b/i.test(s)) ||
    sentences[0] ||
    'Devon reacts quietly, eyes adjusting to what just happened'

  return devonFirst.slice(0, 180)
}
