import { describe, expect, it } from 'vitest'
import {
  boundary,
  boundaryViolations,
  continuityAdvanceBlocker,
  continuityForOption,
  formatBoundary,
  seasonContinuityViolations,
} from './continuity'
import {
  continuityForEpisode,
  DEVON_SEED_IMAGE,
  seedState,
  upgradePilotState,
} from './seed'

describe('pilot continuity ledger', () => {
  it('fails closed until a generated episode has an accepted exact final frame', () => {
    const episode = seedState().episodes[0]
    episode.number = 2
    episode.videoUrl = 'https://example.com/ep-2.mp4'
    episode.renderStatus = 'done'
    episode.lastFrameUrl = null

    expect(continuityAdvanceBlocker(episode)).toContain('no accepted exact final frame')
    episode.lastFrameUrl = 'https://example.com/ep-2-final.png'
    expect(continuityAdvanceBlocker(episode)).toBeNull()
  })

  it('pre-bakes every seed vote option from the exact episode closing frame', () => {
    const state = seedState()
    const episode = state.episodes[0]

    for (const option of episode.options) {
      const plan = continuityForOption(episode, option)
      expect(boundaryViolations(episode.continuity!.closing, plan.opening)).toEqual([])
      expect(plan.action.length).toBeGreaterThan(10)
      expect(plan.closing.wardrobe).toBe(state.productionBible!.characters.devon.wardrobe)
      expect(plan.closing.hair).toBe(state.productionBible!.characters.devon.hair)
    }
  })

  it('detects spatial, prop, motion, and wardrobe resets across a cut', () => {
    const prior = boundary()
    const reset = boundary({
      location: 'bar',
      position: 'standing at the counter',
      screenDirection: 'camera-left',
      props: ['drink in left hand'],
      wardrobe: 'black suit',
    })

    expect(boundaryViolations(prior, reset)).toEqual(
      expect.arrayContaining(['location', 'position', 'screenDirection', 'props', 'wardrobe'])
    )
  })

  it('reports no season boundary violation when the winning package becomes the next episode', () => {
    const state = seedState()
    const first = state.episodes[0]
    const selected = continuityForOption(first, first.options[0])
    state.episodes.push({
      ...structuredClone(first),
      id: 'ep-2',
      number: 2,
      continuity: selected,
      options: [],
    })

    expect(seasonContinuityViolations(state)).toEqual([])
  })

  it('prefers an extracted final frame while keeping separate identity and prior-video references', () => {
    const state = seedState()
    const prior = state.episodes[0]
    prior.lastFrameUrl = 'https://example.com/ep-1-final.png'
    const next = {
      ...structuredClone(prior),
      id: 'ep-2',
      number: 2,
    }

    const refs = continuityForEpisode(state, next)
    expect(refs.startImageUrl).toBe(prior.lastFrameUrl)
    expect(refs.identityImageUrl).toBe(DEVON_SEED_IMAGE)
    expect(refs.previousVideoUrl).toBe(prior.videoUrl)
  })

  it('formats every script-supervisor field for the writer and renderer', () => {
    const text = formatBoundary(boundary())
    for (const label of [
      'location=',
      'position=',
      'screen-direction=',
      'motion=',
      'wardrobe=',
      'hair=',
      'props=',
      'camera=',
      'expression=',
    ]) {
      expect(text).toContain(label)
    }
  })

  it('upgrades the existing office-to-Luchos season with an explicit visible time bridge', () => {
    const legacy = seedState()
    legacy.productionBible = undefined
    const first = legacy.episodes[0]
    first.winnerOptionId = 'a'
    first.continuity = undefined
    for (const option of first.options) option.continuity = undefined

    const second = {
      ...structuredClone(first),
      id: 'ep-2',
      number: 2,
      title: 'Out the Door',
      winnerOptionId: 'c',
      continuity: undefined,
      options: [
        {
          id: 'c',
          label: 'Peek through the window 👀',
          detail: 'Scope the room first',
          visualBeat:
            'Devon leans toward the bar window, hand shielding the glare, scanning the crowd inside.',
          stageDirection:
            "Devon cups one hand against Lucho's front window and leans in.",
          votes: 1,
        },
      ],
    }
    const third = {
      ...structuredClone(second),
      id: 'ep-3',
      number: 3,
      title: 'Face in the Glass',
      winnerOptionId: null,
      continuity: undefined,
      options: [],
    }
    legacy.episodes = [first, second, third]

    upgradePilotState(legacy)

    const upgradedSecond = legacy.episodes[1]
    const upgradedThird = legacy.episodes[2]
    expect(upgradedSecond.options[0].continuity?.transition.mode).toBe('time-bridge')
    expect(upgradedSecond.options[0].continuity?.opening.location).toContain('office')
    expect(upgradedThird.continuity?.closing.location).toContain("Lucho's front window")
    expect(seasonContinuityViolations(legacy)).toEqual([])
  })
})
