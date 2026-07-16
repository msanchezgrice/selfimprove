import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { callClaude } from '@/lib/ai/call-claude'
import {
  getState,
  saveState,
  toPublicState,
  hasRenderCreds,
  getRenderMode,
  hasCloudApiCreds,
} from '@/lib/pilot/store'
import { submitImageToVideo, checkRender } from '@/lib/pilot/higgsfield'
import {
  hasConsumerCreds,
  submitConsumerImageToVideo,
  checkConsumerRender,
} from '@/lib/pilot/higgsfield-consumer'
import { DEVON_SEED_IMAGE, continuityForEpisode } from '@/lib/pilot/seed'
import { buildCoherentVideoPrompt } from '@/lib/pilot/video-prompt'
import type { PilotEpisode, PilotState } from '@/lib/pilot/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * "Run cycle" — one accelerated night.
 *
 * Default path: write beat → submit Higgsfield consumer job → client (and
 * after()) poll until the mp4 attaches. No separate CLI step required when
 * HF_REFRESH_TOKEN is configured.
 */

const MIN_CYCLE_GAP_MS = 15_000

type Beat = {
  title: string
  logline: string
  /** Reader script — must describe the LOCKED winning camera package, not invent a new one */
  script: string
  options: Array<{
    label: string
    detail: string
    visual_beat: string
    stage_direction: string
  }>
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
        'Reader script, max 90 words, present tense. MUST narrate the LOCKED camera package from the winning vote — do not invent a different action (no finger-guns, no new business). At most two short spoken lines. Can mention other characters for readers.',
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
              'LOCKED if this wins: ONE safe Devon-only action to film (max 16 words, verb phrase). No guns/weapons/violence metaphors.',
          },
          stage_direction: {
            type: 'string',
            description:
              'LOCKED if this wins: 2-3 sentences of open/middle/close blocking for a medium close-up of Devon alone. PG workplace comedy only. Max 60 words.',
          },
        },
        required: ['label', 'detail', 'visual_beat', 'stage_direction'],
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
  required: ['title', 'logline', 'script', 'options', 'state_delta'],
}

function pickWinner(episode: PilotEpisode) {
  return episode.options.reduce((best, o) => (o.votes > best.votes ? o : best), episode.options[0])
}

function historySummary(state: PilotState): string {
  return state.episodes
    .slice(-6)
    .map((e) => {
      const winner = e.options.find((o) => o.id === e.winnerOptionId)
      const visual = winner?.visualBeat ? ` [filmed: ${winner.visualBeat}]` : ''
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

    const lockedVisual =
      winner.visualBeat?.trim() ||
      `follows through on: ${winner.label.replace(/[^\w\s]/g, '').trim()}`
    const lockedStage =
      winner.stageDirection?.trim() ||
      `Fade in on Devon. He ${lockedVisual.replace(/^devon\s+/i, '')}. Hold on his face for the fade-out.`

    const beat = await callClaude<Beat>({
      prompt: [
        `You are the nightly writer for "Patch Notes", a vertical-video life-sim drama.`,
        `The audience votes on a PRE-APPROVED camera package. You do NOT invent the shot — you narrate the locked package and open the next poll.`,
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
        `LOCKED VISUAL (film this exactly — do not replace): ${lockedVisual}`,
        `LOCKED STAGE DIRECTION (honor this blocking): ${lockedStage}`,
        ``,
        `Write the episode that results from that choice. Rules:`,
        `- Reader script MUST describe the locked visual/stage — no alternate business, no "finger-guns", no weapons, no violence metaphors.`,
        `- Soft PG workplace/life comedy. Grounded, relatable, a little funny.`,
        `- Consequences must follow from the choice AND character state.`,
        `- For EACH of the 3 next options, pre-bake a full camera package: visual_beat + stage_direction. Those packages are what get filmed if that option wins tomorrow — make them specific and safe.`,
        `- visual_beat / stage_direction: Devon alone in medium close-up; no other named characters on camera.`,
        `- NEVER put guns, weapons, shooting, fighting, blood, or violent jokes in options.`,
        `- Savings changes must be realistic for the action taken.`,
      ].join('\n'),
      schema: BEAT_SCHEMA,
      schemaName: 'next_episode_beat',
      schemaDescription: 'Narrate the locked vote and open tomorrow\'s poll with pre-baked camera packages',
      maxTokens: 2048,
      temperature: 0.7,
    })

    state.character.savings = Math.round(state.character.savings + beat.state_delta.savings_change)
    state.character.energy = Math.max(
      0,
      Math.min(100, Math.round(state.character.energy + beat.state_delta.energy_change))
    )
    state.character.job = beat.state_delta.job
    state.character.social = beat.state_delta.social
    state.character.mood = beat.state_delta.mood

    // Kling uses ONLY the pre-voted camera package — never Claude's free invention.
    const videoPrompt = buildCoherentVideoPrompt({
      script: beat.script,
      mood: beat.state_delta.mood,
      visualBeat: lockedVisual,
      stageDirection: lockedStage,
      continuing: state.episodes.some((e) => e.videoUrl),
    })

    const renderMode = getRenderMode()
    const continuityStill = DEVON_SEED_IMAGE

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
        stageDirection: o.stage_direction,
        votes: 0,
      })),
      winnerOptionId: null,
      createdAt: new Date().toISOString(),
    }

    let renderError: string | null = null

    if (renderMode === 'consumer' && hasConsumerCreds(state)) {
      try {
        const { requestId, authChanged } = await submitConsumerImageToVideo(state, {
          prompt: videoPrompt,
          imageUrl: DEVON_SEED_IMAGE,
        })
        episode.hfRequestId = requestId
        episode.renderStatus = 'rendering'
        if (authChanged) {
          // auth already written onto state by ensureConsumerAuth
        }
      } catch (err) {
        console.error('pilot: consumer render submit failed', err)
        episode.renderStatus = 'failed'
        renderError = err instanceof Error ? err.message : 'consumer render failed'
      }
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
    } else if (renderMode === 'session') {
      episode.renderStatus = 'rendering'
    }

    state.episodes.push(episode)
    state.lastCycleAt = new Date().toISOString()
    await saveState(state)

    const continuity = continuityForEpisode(state, episode)

    // Keep polling after the response so the clip attaches even if the tab closes.
    if (episode.renderStatus === 'rendering' && episode.hfRequestId) {
      const episodeId = episode.id
      const requestId = episode.hfRequestId
      const mode = renderMode
      after(async () => {
        try {
          for (let i = 0; i < 36; i++) {
            await new Promise((r) => setTimeout(r, 5_000))
            const latest = await getState()
            const ep = latest.episodes.find((e) => e.id === episodeId)
            if (!ep || ep.renderStatus !== 'rendering' || !ep.hfRequestId) return

            if (mode === 'consumer') {
              const { check, authChanged } = await checkConsumerRender(latest, requestId)
              if (authChanged) await saveState(latest)
              if (check.status === 'completed') {
                ep.videoUrl = check.videoUrl
                if (check.thumbnailUrl) ep.posterUrl = check.thumbnailUrl
                ep.renderStatus = 'done'
                await saveState(latest)
                return
              }
              if (check.status === 'failed') {
                ep.renderStatus = 'failed'
                await saveState(latest)
                return
              }
            } else if (mode === 'api') {
              const check = await checkRender(requestId)
              if (check.status === 'completed') {
                ep.videoUrl = check.videoUrl
                ep.renderStatus = 'done'
                await saveState(latest)
                return
              }
              if (check.status === 'failed') {
                ep.renderStatus = 'failed'
                await saveState(latest)
                return
              }
            }
          }
        } catch (err) {
          console.error('pilot: background render poll failed', err)
        }
      })
    }

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
              visualAction: lockedVisual,
              stageDirection: lockedStage,
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
