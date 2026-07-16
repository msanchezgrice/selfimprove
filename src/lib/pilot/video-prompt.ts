/**
 * Image-to-video continuity for Patch Notes.
 *
 * Loop: seed video → audience chooses → render next clip.
 * Identity lock: same Devon. Scenes must feel like consecutive shots in one show.
 */

const DEVON_LOOK =
  'Devon, 26, short curly brown hair, light stubble — SAME person as the reference / previous clip'

export function buildCoherentVideoPrompt(opts: {
  script: string
  mood: string
  visualBeat?: string | null
  /** Full cinematic stage direction from the writer */
  stageDirection?: string | null
  settingHint?: string | null
  continuing?: boolean
}): string {
  const action = extractDevonAction(opts.script, opts.visualBeat)
  const setting =
    opts.settingHint?.trim() ||
    inferSetting(opts.script) ||
    'dim warm bar interior, shallow depth of field, soft amber practical lights'

  const continuity = opts.continuing
    ? `CONTINUITY: Pick up from the previous episode's last frame. Same Devon — identical face, hair, age, skin. Wardrobe may shift only if the story moved locations; otherwise keep it. This is the next shot in the same show, not a reboot.`
    : `IDENTITY: Start from the reference photo of ${DEVON_LOOK}. Season identity lock.`

  const stage =
    opts.stageDirection?.trim() ||
    `Beat: ${action}. Camera starts tight on Devon, holds through the action, ends on his face.`

  return [
    `Vertical 9:16, ~10 second SINGLE continuous shot, cinematic drama, no cuts, no montage.`,
    `FADE: open with a soft 0.5s fade-in from black; close with a soft 0.5s fade-out to black on Devon's face (tomorrow's match cut).`,
    continuity,
    `SETTING: ${setting}.`,
    `STAGE DIRECTION: ${stage}`,
    `ON-CAMERA ACTION (Devon only in focus): ${action}`,
    `CAMERA: medium close-up on Devon, face + upper body; motivated micro-moves only (slow push-in or hold). Other people stay off-frame or extreme soft bokeh — never steal focus.`,
    `PERFORMANCE: mood "${opts.mood}" — grounded micro-expressions, living-room TV drama, not a trailer.`,
    `STRICT: no legible text on phones/screens/signs/glass; no subtitles; no logos; no jump cuts.`,
    `LAST FRAME: hold Devon's face after the fade begins — that still is tomorrow's opening.`,
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
