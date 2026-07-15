/**
 * Image-to-video from Devon's seed face can only reliably show DEVON acting.
 * Wide multi-character bar scenes in the script read well as text but produce
 * generic "guy in a bar" clips. This builder forces a single Devon-locked shot
 * that mirrors the script's emotional beat.
 */

const DEVON_LOOK =
  'Devon, 26, short curly brown hair, light stubble, same face as the reference image'

export function buildCoherentVideoPrompt(opts: {
  script: string
  mood: string
  /** Audience/director note — what we should SEE if this choice won */
  visualBeat?: string | null
  settingHint?: string | null
}): string {
  const action = extractDevonAction(opts.script, opts.visualBeat)
  const setting =
    opts.settingHint?.trim() ||
    inferSetting(opts.script) ||
    'dim warm bar interior, shallow depth of field, soft amber practical lights'

  return [
    `Vertical 9:16, 10-second single continuous shot, cinematic, no cuts.`,
    `Start from the reference photo of ${DEVON_LOOK}.`,
    `SETTING: ${setting}.`,
    `ACTION (must match the episode script beat): ${action}`,
    `Camera: medium close-up on Devon, locked on his face and upper body; other people stay off-frame or soft background bokeh only.`,
    `Performance: mood is "${opts.mood}" — subtle, grounded, natural micro-expressions, no melodrama.`,
    `STRICT: no legible text on any phone, screen, sign, or glass; no subtitles; no logos.`,
    `End held still on Devon's face for the final second.`,
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

/**
 * Prefer an explicit visualBeat; otherwise pull Devon's key verb phrase from the script.
 */
function extractDevonAction(script: string, visualBeat?: string | null): string {
  const beat = visualBeat?.trim()
  if (beat) {
    return `Devon ${beat.replace(/^devon\s+/i, '')}`
  }

  // Prefer a spoken line + reaction if present.
  const spoken = script.match(/Devon[^.!]{0,40}(?:grins|says|goes|exhales|asks|pulls|nods|sips|laughs|looks)[^.!]{0,80}[.!]/i)
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
