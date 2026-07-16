import { NextRequest, NextResponse } from 'next/server'
import { callClaude } from '@/lib/ai/call-claude'
import {
  getState,
  saveState,
  toPublicState,
  hasRenderCreds,
  getRenderMode,
  hasCloudApiCreds,
} from '@/lib/pilot/store'
import { submitImageToVideo } from '@/lib/pilot/higgsfield'
import { DEVON_SEED_IMAGE, continuityForEpisode } from '@/lib/pilot/seed'
import { buildCoherentVideoPrompt } from '@/lib/pilot/video-prompt'
import type { PilotEpisode, PilotState } from '@/lib/pilot/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * "Run cycle" — one accelerated night.
 *
 * Video is generated via the Higgsfield *consumer* session by default
 * (CLI/MCP → /api/pilot/attach). Platform API keys are opt-in only.
 */

const MIN_CYCLE_GAP_MS = 15_000

type Beat = {
  title: string
  logline: string
  script: string
  /** Single Devon-locked visual action for i2v (verb phrase, no camera jargon) */
  visual_action: string
  /** Thorough cinematic stage direction connecting this shot to the previous night */
  stage_direction: string
  options: Array<{ label: string; detail: string; visual_beat: string }>
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
        'Reader script, max 90 words, present tense, at most two short spoken lines. Can mention other characters.',
    },
    visual_action: {
      type: 'string',
      description:
        'ONE concrete action Devon performs on camera, max 20 words, present tense, verb-first. Filmable as a medium close-up of Devon alone.',
    },
    stage_direction: {
      type: 'string',
      description:
        'Thorough stage direction for a connected TV beat (2-4 sentences): where we left him last night, how this shot opens (fade-in / match cut), blocking, eyeline, prop business, how it closes on his face for tomorrow. Max 80 words.',
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
          visual_beat: {
            type: 'string',
            description:
              'If this option wins, the Devon-locked action we should film next (max 16 words, verb phrase)',
          },
        },
        required: ['label', 'detail', 'visual_beat'],
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
  required: [
    'title',
    'logline',
    'script',
    'visual_action',
    'stage_direction',
    'options',
    'state_delta',
  ],
}

function pickWinner(episode: PilotEpisode) {
  return episode.options.reduce((best, o) => (o.votes > best.votes ? o : best), episode.options[0])
}

function historySummary(state: PilotState): string {
  return state.episodes
    .slice(-6)
    .map((e) => {
      const winner = e.options.find((o) => o.id === e.winnerOptionId)
      const visual = winner?.visualBeat ? ` [visual: ${winner.visualBeat}]` : ''
      return `Ep ${e.number} "${e.title}": ${e.logline}${winner ? ` → audience chose: ${winner.label}${visual}` : ' (poll open)'}`
    })
    .join('\n')
}

export async function POST() {
  return runCycle(true)
}

export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get('key') ||
    req.headers.get('authorization')?.replace('Bearer ', '')
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return runCycle(true)
}

async function runCycle(includePrompt: boolean) {
  try {
    const state = await getState()
    const current = state.episodes[state.episodes.length - 1]
    if (!current) {
      return NextResponse.json({ error: 'no episodes' }, { status: 400 })
    }

    if (state.lastCycleAt && Date.now() - Date.parse(state.lastCycleAt) < MIN_CYCLE_GAP_MS) {
      const latest = state.episodes[state.episodes.length - 1]
      // Soft success: return current state so a stuck client can unlock + sync.
      return NextResponse.json(
        {
          ...toPublicState(state),
          error: 'cycle already ran in the last 15s — showing latest state',
          cycle: {
            closedEpisode: Math.max(1, latest.number - 1),
            winner: null,
            newEpisode: latest.number,
            newEpisodeId: latest.id,
            rendering: latest.renderStatus === 'rendering',
            renderingEnabled: hasRenderCreds(),
            renderMode: getRenderMode(),
            recovered: true,
            ...(includePrompt
              ? {
                  videoPrompt: latest.videoPrompt,
                  script: latest.script,
                  seedImageUrl: latest.posterUrl || DEVON_SEED_IMAGE,
                }
              : {}),
          },
        },
        { status: 200 }
      )
    }

    // Avoid double-append if a prior attempt already opened the next night.
    if (current.winnerOptionId) {
      const existingNext = state.episodes.find((e) => e.number === current.number + 1)
      if (existingNext) {
        return NextResponse.json({
          ...toPublicState(state),
          cycle: {
            closedEpisode: current.number,
            winner: current.options.find((o) => o.id === current.winnerOptionId)?.label ?? null,
            newEpisode: existingNext.number,
            newEpisodeId: existingNext.id,
            rendering: existingNext.renderStatus === 'rendering',
            renderingEnabled: hasRenderCreds(),
            renderMode: getRenderMode(),
            recovered: true,
            ...(includePrompt
              ? {
                  videoPrompt: existingNext.videoPrompt,
                  script: existingNext.script,
                  seedImageUrl: existingNext.posterUrl || DEVON_SEED_IMAGE,
                }
              : {}),
          },
        })
      }
    }

    const winner = pickWinner(current)
    current.winnerOptionId = winner.id

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
        winner.visualBeat
          ? `DIRECTOR NOTE FROM THE WINNING VOTE (honor this on camera): ${winner.visualBeat}`
          : `No director note — invent a Devon-locked visual_action that clearly shows the choice's consequence.`,
        ``,
        `Write the next episode beat. Rules:`,
        `- Grounded, relatable, a little funny. PG-13. No melodrama.`,
        `- Treat nights as consecutive scenes in ONE show — stage_direction must bridge from the previous episode's ending into this shot (match cut / eyeline / prop carry).`,
        `- Consequences must follow from the choice AND the character state (money, energy, friendships compound).`,
        `- The script can mention Sam/Marcus/etc for readers.`,
        `- visual_action MUST be filmable as a medium close-up of Devon ALONE. Do NOT put other named characters in visual_action.`,
        `- stage_direction is thorough blocking for the camera: open (fade-in), middle action, close (fade-out on his face for tomorrow).`,
        `- visual_action must literally enact the audience's choice, not a generic "sips beer looking sad".`,
        `- Each option needs a visual_beat so the next night's video stays coherent if that option wins.`,
        `- Savings changes must be realistic for the action taken.`,
      ].join('\n'),
      schema: BEAT_SCHEMA,
      schemaName: 'next_episode_beat',
      schemaDescription: 'The next episode of the life-sim drama',
      maxTokens: 2048,
      temperature: 0.9,
    })

    state.character.savings = Math.round(state.character.savings + beat.state_delta.savings_change)
    state.character.energy = Math.max(
      0,
      Math.min(100, Math.round(state.character.energy + beat.state_delta.energy_change))
    )
    state.character.job = beat.state_delta.job
    state.character.social = beat.state_delta.social
    state.character.mood = beat.state_delta.mood

    const videoPrompt = buildCoherentVideoPrompt({
      script: beat.script,
      mood: beat.state_delta.mood,
      visualBeat: beat.visual_action || winner.visualBeat,
      stageDirection: beat.stage_direction,
      continuing: state.episodes.some((e) => e.videoUrl),
    })

    const renderMode = getRenderMode()
    // Continuity still: prefer last episode poster / seed face so Devon stays locked.
    const priorWithVideo = [...state.episodes].reverse().find((e) => e.videoUrl)
    const continuityStill = priorWithVideo?.posterUrl || DEVON_SEED_IMAGE

    const episode: PilotEpisode = {
      id: `ep-${current.number + 1}`,
      number: current.number + 1,
      title: beat.title,
      logline: beat.logline,
      script: beat.script,
      videoPrompt,
      videoUrl: null,
      posterUrl: continuityStill,
      renderStatus: 'none',
      hfRequestId: null,
      options: beat.options.map((o, i) => ({
        id: ['a', 'b', 'c'][i],
        label: o.label,
        detail: o.detail,
        visualBeat: o.visual_beat,
        votes: 0,
      })),
      winnerOptionId: null,
      createdAt: new Date().toISOString(),
    }

    let renderError: string | null = null

    if (renderMode === 'session') {
      episode.renderStatus = 'rendering'
    } else if (renderMode === 'api' && hasCloudApiCreds()) {
      try {
        const { requestId } = await submitImageToVideo({
          prompt: videoPrompt,
          imageUrl: continuityStill,
        })
        episode.hfRequestId = requestId
        episode.renderStatus = 'rendering'
      } catch (err) {
        console.error('pilot: cloud API render submit failed', err)
        episode.renderStatus = 'failed'
        renderError = err instanceof Error ? err.message : 'cloud API render failed'
      }
    }

    state.episodes.push(episode)
    state.lastCycleAt = new Date().toISOString()
    await saveState(state)

    const continuity = continuityForEpisode(state, episode)

    return NextResponse.json({
      ...toPublicState(state),
      cycle: {
        closedEpisode: current.number,
        winner: winner.label,
        newEpisode: episode.number,
        newEpisodeId: episode.id,
        rendering: episode.renderStatus === 'rendering',
        renderingEnabled: hasRenderCreds(),
        renderMode,
        renderError,
        ...(includePrompt
          ? {
              videoPrompt: episode.videoPrompt,
              script: episode.script,
              seedImageUrl: continuity.startImageUrl,
              startImageUrl: continuity.startImageUrl,
              previousVideoUrl: continuity.previousVideoUrl,
              visualAction: beat.visual_action,
            }
          : {}),
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'cycle failed' },
      { status: 500 }
    )
  }
}
