/**
 * Image-to-video continuity for Patch Notes.
 *
 * Loop: seed video → audience chooses → render next clip.
 * Character consistency is the product: every i2v job starts from the same
 * Devon seed face still. Keep the prompt short so identity instructions win.
 */

const DEVON_LOOK =
  'same man as the reference image: Devon, 26, short curly brown hair, light stubble, warm olive skin, soft brown eyes — do NOT change his face, age, hairline, or bone structure'

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
    'dim warm interior, shallow depth of field'

  const stage =
    opts.stageDirection?.trim() ||
    `Devon ${action.replace(/^Devon\s+/i, '')}. Hold on his face at the end.`

  const audio = inferAudio(opts.script, opts.mood)

  return [
    // Identity first — models overweight early tokens.
    `FACE LOCK: animate the reference image. ${DEVON_LOOK}.`,
    `Vertical 9:16, ~10s, ONE continuous shot, no cuts.`,
    `SETTING: ${setting}.`,
    `ACTION: ${action}.`,
    `BLOCKING: ${stage.slice(0, 280)}`,
    `CAMERA: medium close-up on Devon face + shoulders; slow push-in or hold. Nobody else in focus.`,
    `MOOD: ${opts.mood}. Grounded micro-expressions, not trailer acting.`,
    `AUDIO: ${audio}`,
    `STRICT: keep his face identical to reference; no face morph; no text/logos/subtitles; soft fade-in and fade-out on his face.`,
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

  return devonFirst.slice(0, 160)
}
