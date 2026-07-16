import { describe, expect, it } from 'vitest'
import { applyFrameReconciliation, type FrameReconciliation } from './frame-reconciliation'
import { boundaryViolations } from './continuity'
import { seedState } from './seed'

function reconciliation(): FrameReconciliation {
  return {
    observed: {
      location: 'street-level landing at the top of a subway staircase',
      position: 'left foot planted on the landing, right foot on the final stair',
      facing: 'front three-quarter toward camera',
      screen_direction: 'toward-camera',
      motion: 'finishing an ascent and stepping onto the sidewalk',
      wardrobe: 'blue overcoat over charcoal shirt, dark trousers, white sneakers',
      hair: 'short dense curly brown hair',
      props: ['left hand on the stair rail', 'no handheld phone visible'],
      lighting: 'warm stairwell light behind him and cool street light ahead',
      camera: 'medium full frontal shot at street level',
      expression: 'focused and slightly preoccupied',
      confidence: 0.97,
      travel_phase: 'arriving',
      completed_actions: ['walked to the subway', 'came up the subway stairs'],
      evidence: ['his body grows larger and rises toward the street landing'],
    },
    mismatches: [
      'planned descent is opposite the rendered ascent',
      'proposed ride repeats travel that appears complete',
    ],
    options: [
      {
        label: 'Check the address 📍',
        detail: 'Make sure he surfaced near the right block.',
        visual_beat: 'Devon clears the final step and checks the address on his phone.',
        stage_direction:
          'Devon finishes stepping onto the street landing toward camera. He releases the rail, checks the address, then holds beside the subway sign.',
        dialogue_text: '',
        dialogue_delivery: '',
        transition_mode: 'continuous',
        transition_description: 'Continue the final upward step onto the adjacent sidewalk.',
        end_state: {
          location: 'sidewalk beside the subway entrance',
          position: 'standing clear of the stairs beside the subway sign',
          facing: 'three-quarter toward camera-right',
          screen_direction: 'stationary',
          motion: 'lowering the phone after checking the address',
          props: ['phone in right hand', 'left hand released from rail'],
          lighting: 'cool street light with warm stairwell spill behind him',
          camera: 'medium shot at street level on the same axis',
          expression: 'quietly oriented',
        },
      },
      {
        label: 'Walk toward Lucho’s 🍻',
        detail: 'Commit to the last block on foot.',
        visual_beat: 'Devon steps onto the sidewalk and walks toward the bar lights.',
        stage_direction:
          'Devon finishes stepping onto the street landing toward camera. He turns camera-right and walks one block toward warm bar light, holding mid-stride.',
        dialogue_text: '',
        dialogue_delivery: '',
        transition_mode: 'time-bridge',
        transition_description: 'Show departure from the subway, one sidewalk stride, and arrival outside the bar.',
        end_state: {
          location: 'sidewalk outside Lucho’s',
          position: 'mid-stride one step from the bar door',
          facing: 'profile toward camera-right',
          screen_direction: 'camera-right',
          motion: 'walking toward the bar door',
          props: ['phone in right trouser pocket'],
          lighting: 'warm bar light mixing with cool street light',
          camera: 'medium full profile shot preserving rightward travel',
          expression: 'resolved but nervous',
        },
      },
      {
        label: 'Text Sam from here 📱',
        detail: 'Pause aboveground before taking another step.',
        visual_beat: 'Devon clears the stairs, stops safely aside, and types a short message.',
        stage_direction:
          'Devon finishes stepping onto the street landing toward camera. He moves aside, types one message, and holds with his thumb over send.',
        dialogue_text: '',
        dialogue_delivery: '',
        transition_mode: 'continuous',
        transition_description: 'Continue from the final upward step into a stationary pause beside the entrance.',
        end_state: {
          location: 'sidewalk beside the subway entrance',
          position: 'standing to the side of pedestrian traffic',
          facing: 'front three-quarter toward camera',
          screen_direction: 'stationary',
          motion: 'right thumb hovering over send',
          props: ['phone held in both hands at chest height'],
          lighting: 'cool street light with warm stairwell spill behind him',
          camera: 'medium close-up at street level on the same axis',
          expression: 'careful and hopeful',
        },
      },
    ],
  }
}

describe('rendered-frame continuity reconciliation', () => {
  it('replaces screenplay assumptions with the observed final boundary', () => {
    const state = seedState()
    const episode = state.episodes[0]
    episode.number = 3
    episode.options[0].label = 'Go down the stairs'
    episode.options[1].label = 'Ride in silence'

    applyFrameReconciliation({
      episode,
      result: reconciliation(),
      productionBible: state.productionBible!,
      lastFrameUrl: 'https://example.com/ep-3-final.jpg',
      observedAt: '2026-07-16T16:30:00.000Z',
    })

    expect(episode.continuity?.closing.location).toContain('street-level landing')
    expect(episode.continuity?.closing.motion).toContain('ascent')
    expect(episode.continuityReview).toMatchObject({
      status: 'ready',
      travelPhase: 'arriving',
      confidence: 0.97,
    })
    expect(episode.options.map((option) => option.label).join(' ')).not.toMatch(
      /go down|ride in silence/i
    )
    for (const option of episode.options) {
      expect(boundaryViolations(episode.continuity!.closing, option.continuity!.opening)).toEqual([])
      expect(option.stageDirection).toMatch(/finishes stepping onto the street landing/i)
    }
  })
})
