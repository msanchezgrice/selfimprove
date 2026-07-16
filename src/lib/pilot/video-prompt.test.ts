import { describe, expect, it } from 'vitest'
import { continuityForOption, createProductionBible } from './continuity'
import { seedState } from './seed'
import { buildCoherentVideoPrompt, sanitizeForVideo } from './video-prompt'

describe('Higgsfield continuity prompt', () => {
  it('puts identity, boundary, axis, prop, and voice locks in one render contract', () => {
    const state = seedState()
    const episode = state.episodes[0]
    const plan = continuityForOption(episode, episode.options[0])
    plan.dialogue = { text: "I'm going.", delivery: 'quiet and resolved' }
    plan.transition = {
      mode: 'match-on-action',
      description: 'match his left foot crossing both doorway shots',
    }

    const prompt = buildCoherentVideoPrompt({
      script: episode.script,
      mood: 'Resolved',
      continuity: plan,
      productionBible: createProductionBible(),
      hasPreviousVideoReference: true,
      hasVoiceReference: true,
    })

    expect(prompt).toContain('IDENTITY LOCK:')
    expect(prompt).toContain('FRAME 0 MATCH:')
    expect(prompt).toContain('FINAL FRAME LOCK:')
    expect(prompt).toContain('CAMERA AXIS:')
    expect(prompt).toContain('phone in right trouser pocket')
    expect(prompt).toContain('match the supplied Devon voice reference exactly')
    expect(prompt).toContain('Accurate natural lip sync')
    expect(prompt).toContain('TWO-SHOT MATCH CUT')
    expect(prompt).toContain('same limb position')
    expect(prompt).toContain('no fade')
  })

  it('removes weapon metaphors before they reach a video model', () => {
    expect(sanitizeForVideo('Devon enters with finger-guns, guns blazing.')).not.toMatch(
      /gun/i
    )
    expect(sanitizeForVideo('Hold the low-angle shot as Devon exits.')).toContain(
      'low-angle shot'
    )
  })
})
