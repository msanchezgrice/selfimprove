import { NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/call-claude'
import { getState, saveState, toPublicState, hasRenderCreds } from '@/lib/pilot/store'
import { submitImageToVideo } from '@/lib/pilot/higgsfield'
import { DEVON_SEED_IMAGE } from '@/lib/pilot/seed'
import type { PilotEpisode, PilotState } from '@/lib/pilot/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * "Run cycle" — one accelerated night. In production this runs on a nightly
 * cron; the button exists so nights can be fast-forwarded during testing.
 *
 * 1. Close the current poll, pick the winner.
 * 2. Claude writes the next beat from character state + the winning choice.
 * 3. Apply state deltas; render the episode via Higgsfield (if creds set).
 * 4. Open the next poll.
 */

const MIN_CYCLE_GAP_MS = 60_000

type Beat = {
  title: string
  logline: string
  script: string
  video_prompt: string
  options: Array<{ label: string; detail: string }>
  state_delta: {
    savings_change: number
    energy_change: number
    job: string
    social: string
    mood: string
  }
}

const BEAT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Episode title, max 5 words' },
    logline: { type: 'string', description: 'One-sentence hook for the episode card' },
    script: {
      type: 'string',
      description:
        'The scene, max 90 words, present tense, includes at most two short spoken lines',
    },
    video_prompt: {
      type: 'string',
      description:
        'Prompt for a 10s single-shot vertical AI video of the scene. MUST say no legible text on any screen or surface. Devon: 26, short curly brown hair, light stubble. End held on his face.',
    },
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Voteable action, max 6 words, one emoji' },
          detail: { type: 'string', description: 'Consequence hint, max 12 words' },
        },
        required: ['label', 'detail'],
      },
    },
    state_delta: {
      type: 'object',
      properties: {
        savings_change: { type: 'number', description: 'Dollars gained/lost this episode' },
        energy_change: { type: 'number', description: 'Energy percentage points gained/lost' },
        job: { type: 'string', description: 'Current job label (change only if the story changed it)' },
        social: { type: 'string', description: 'One-line social status, e.g. "Sam: back in the chat"' },
        mood: { type: 'string', description: 'One-word mood' },
      },
      required: ['savings_change', 'energy_change', 'job', 'social', 'mood'],
    },
  },
  required: ['title', 'logline', 'script', 'video_prompt', 'options', 'state_delta'],
}

function pickWinner(episode: PilotEpisode) {
  return episode.options.reduce((best, o) => (o.votes > best.votes ? o : best), episode.options[0])
}

function historySummary(state: PilotState): string {
  return state.episodes
    .slice(-6)
    .map((e) => {
      const winner = e.options.find((o) => o.id === e.winnerOptionId)
      return `Ep ${e.number} "${e.title}": ${e.logline}${winner ? ` → audience chose: ${winner.label}` : ' (poll open)'}`
    })
    .join('\n')
}

export async function POST() {
  try {
    const state = await getState()
    const current = state.episodes[state.episodes.length - 1]

    if (state.lastCycleAt && Date.now() - Date.parse(state.lastCycleAt) < MIN_CYCLE_GAP_MS) {
      return NextResponse.json(
        { error: 'cycle already ran in the last minute — slow down' },
        { status: 429 }
      )
    }

    // 1. Close the poll.
    const winner = pickWinner(current)
    current.winnerOptionId = winner.id

    // 2. Write the next beat.
    const beat = await callClaude<Beat>({
      prompt: [
        `You are the nightly writer for "Patch Notes", a vertical-video life-sim drama.`,
        `The audience votes each night on what Devon does next; their choice becomes the next episode.`,
        ``,
        `CHARACTER STATE`,
        `Name: ${state.character.name} (26)`,
        `Job: ${state.character.job}`,
        `Savings: $${state.character.savings}`,
        `Energy: ${state.character.energy}%`,
        `Social: ${state.character.social}`,
        `Mood: ${state.character.mood}`,
        ``,
        `RECENT EPISODES`,
        historySummary(state),
        ``,
        `THE AUDIENCE JUST CHOSE: "${winner.label}" (${winner.detail})`,
        ``,
        `Write the next episode beat. Rules:`,
        `- Grounded, relatable, a little funny. PG-13. No melodrama.`,
        `- Consequences must follow from the choice AND the character state (money, energy, friendships compound).`,
        `- The three new options must be genuinely different paths people will argue about.`,
        `- Savings changes must be realistic for the action taken.`,
        `- The video prompt is for a 10-second single-shot vertical clip starting from a reference photo of Devon; it must forbid legible on-screen text.`,
      ].join('\n'),
      schema: BEAT_SCHEMA,
      schemaName: 'next_episode_beat',
      schemaDescription: 'The next episode of the life-sim drama',
      maxTokens: 2048,
      temperature: 1,
    })

    // 3. Apply state deltas.
    state.character.savings = Math.round(state.character.savings + beat.state_delta.savings_change)
    state.character.energy = Math.max(
      0,
      Math.min(100, Math.round(state.character.energy + beat.state_delta.energy_change))
    )
    state.character.job = beat.state_delta.job
    state.character.social = beat.state_delta.social
    state.character.mood = beat.state_delta.mood

    // 4. Create the next episode and kick off the render.
    const episode: PilotEpisode = {
      id: `ep-${current.number + 1}`,
      number: current.number + 1,
      title: beat.title,
      logline: beat.logline,
      script: beat.script,
      videoPrompt: beat.video_prompt,
      videoUrl: null,
      posterUrl: DEVON_SEED_IMAGE,
      renderStatus: 'none',
      hfRequestId: null,
      options: beat.options.map((o, i) => ({
        id: ['a', 'b', 'c'][i],
        label: o.label,
        detail: o.detail,
        votes: 0,
      })),
      winnerOptionId: null,
      createdAt: new Date().toISOString(),
    }

    if (hasRenderCreds()) {
      try {
        const { requestId } = await submitImageToVideo({
          prompt: beat.video_prompt,
          imageUrl: DEVON_SEED_IMAGE,
        })
        episode.hfRequestId = requestId
        episode.renderStatus = 'rendering'
      } catch (err) {
        console.error('pilot: render submit failed', err)
        episode.renderStatus = 'failed'
      }
    }

    state.episodes.push(episode)
    state.lastCycleAt = new Date().toISOString()
    await saveState(state)

    return NextResponse.json({
      ...toPublicState(state),
      cycle: {
        closedEpisode: current.number,
        winner: winner.label,
        newEpisode: episode.number,
        rendering: episode.renderStatus === 'rendering',
        renderingEnabled: hasRenderCreds(),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cycle failed' },
      { status: 500 }
    )
  }
}
