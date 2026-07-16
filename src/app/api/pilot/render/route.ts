import { NextRequest, NextResponse } from 'next/server'
import { getState, saveState, toPublicState, getRenderMode } from '@/lib/pilot/store'
import { checkRender, submitImageToVideo } from '@/lib/pilot/higgsfield'
import {
  hasConsumerCreds,
  submitConsumerImageToVideo,
  checkConsumerRender,
} from '@/lib/pilot/higgsfield-consumer'
import { continuityForEpisode, DEVON_SEED_IMAGE } from '@/lib/pilot/seed'
import { buildCoherentVideoPrompt } from '@/lib/pilot/video-prompt'
import { productionBibleFor } from '@/lib/pilot/continuity'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Poll / inspect / kick render status.
 *
 * Keyed pending job (legacy CLI worker):
 *   GET /api/pilot/render?key=CRON_SECRET&pending=1
 *
 * Client poll after "Run one night":
 *   POST /api/pilot/render { episodeId }
 *   — checks consumer/platform job; if stuck with no job id, submits one.
 *
 * Force re-render (e.g. after a bad model literalization; requires CRON_SECRET):
 *   POST /api/pilot/render { episodeId, force: true }
 */
export async function GET(req: NextRequest) {
  const key =
    req.nextUrl.searchParams.get('key') ||
    req.headers.get('authorization')?.replace('Bearer ', '')
  const wantPending = req.nextUrl.searchParams.get('pending') === '1'

  if (wantPending) {
    if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    const state = await getState()
    const pending = state.episodes.find(
      (e) => e.renderStatus === 'rendering' && !e.videoUrl && !e.hfRequestId
    )
    if (!pending) {
      return NextResponse.json({ pending: null })
    }

    const continuity = continuityForEpisode(state, pending)
    const prior = state.episodes.find((e) => e.id === continuity.previousEpisodeId)
    const sourceChoice = prior?.options.find((o) => o.id === prior.winnerOptionId)

    return NextResponse.json({
      pending: {
        episodeId: pending.id,
        number: pending.number,
        title: pending.title,
        videoPrompt: pending.videoPrompt,
        seedImageUrl: continuity.identityImageUrl || DEVON_SEED_IMAGE,
        identityImageUrl: continuity.identityImageUrl || DEVON_SEED_IMAGE,
        startImageUrl: continuity.startImageUrl || DEVON_SEED_IMAGE,
        previousVideoUrl: continuity.previousVideoUrl,
        voiceReferenceUrl: continuity.voiceReferenceUrl,
        previousEpisodeId: continuity.previousEpisodeId,
        sourceChoice: sourceChoice
          ? {
              label: sourceChoice.label,
              detail: sourceChoice.detail,
              visualBeat: sourceChoice.visualBeat ?? null,
            }
          : null,
        script: pending.script,
      },
    })
  }

  return NextResponse.json({ renderMode: getRenderMode() })
}

export async function POST(req: NextRequest) {
  try {
    const { episodeId, force, key } = (await req.json()) as {
      episodeId?: string
      force?: boolean
      key?: string
    }
    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId required' }, { status: 400 })
    }
    if (
      force &&
      (!process.env.CRON_SECRET ||
        (key || req.headers.get('authorization')?.replace('Bearer ', '')) !==
          process.env.CRON_SECRET)
    ) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const state = await getState()
    const episode = state.episodes.find((e) => e.id === episodeId)
    if (!episode) {
      return NextResponse.json({ error: 'unknown episode' }, { status: 404 })
    }

    const mode = getRenderMode()
    let authDirty = false
    const continuity = continuityForEpisode(state, episode)

    if (force) {
      const bible = productionBibleFor(state)
      episode.videoPrompt = buildCoherentVideoPrompt({
        script: episode.script,
        mood: state.character.mood,
        visualBeat: episode.continuity?.action,
        continuity: episode.continuity,
        productionBible: bible,
        continuing: Boolean(continuity.previousEpisodeId),
        hasIdentityImageReference:
          !continuity.startImageUrl ||
          continuity.startImageUrl === continuity.identityImageUrl,
        hasPreviousVideoReference: Boolean(continuity.previousVideoUrl),
        hasVoiceReference: Boolean(continuity.voiceReferenceUrl),
      })
      episode.videoUrl = null
      episode.lastFrameUrl = null
      episode.hfRequestId = null
      episode.renderStatus = 'rendering'
    }

    // Stuck episode: written but never submitted — kick off consumer render now.
    if (
      episode.renderStatus === 'rendering' &&
      !episode.videoUrl &&
      !episode.hfRequestId &&
      mode === 'consumer' &&
      hasConsumerCreds(state)
    ) {
      const { requestId, authChanged } = await submitConsumerImageToVideo(state, {
        prompt: episode.videoPrompt,
        imageUrl: continuity.identityImageUrl,
        startImageUrl: continuity.startImageUrl,
        videoReferenceUrl: continuity.previousVideoUrl,
        audioReferenceUrl: continuity.voiceReferenceUrl,
      })
      episode.hfRequestId = requestId
      authDirty = authChanged
      await saveState(state)
    }

    if (
      episode.renderStatus === 'rendering' &&
      !episode.videoUrl &&
      !episode.hfRequestId &&
      mode === 'api'
    ) {
      const { requestId } = await submitImageToVideo({
        prompt: episode.videoPrompt,
        imageUrl: continuity.startImageUrl || continuity.identityImageUrl,
      })
      episode.hfRequestId = requestId
      await saveState(state)
    } else if (
      episode.renderStatus === 'rendering' &&
      !episode.videoUrl &&
      !episode.hfRequestId &&
      mode === 'session' &&
      force
    ) {
      await saveState(state)
    }

    if (episode.renderStatus === 'rendering' && episode.hfRequestId) {
      if (mode === 'consumer') {
        const { check, authChanged } = await checkConsumerRender(state, episode.hfRequestId)
        authDirty = authDirty || authChanged
        if (check.status === 'completed') {
          episode.videoUrl = check.videoUrl
          if (check.thumbnailUrl) episode.posterUrl = check.thumbnailUrl
          episode.renderStatus = 'done'
          await saveState(state)
        } else if (check.status === 'failed') {
          episode.renderStatus = 'failed'
          await saveState(state)
        } else if (authDirty) {
          await saveState(state)
        }
      } else if (mode === 'api') {
        const check = await checkRender(episode.hfRequestId)
        if (check.status === 'completed') {
          episode.videoUrl = check.videoUrl
          episode.renderStatus = 'done'
          await saveState(state)
        } else if (check.status === 'failed') {
          episode.renderStatus = 'failed'
          await saveState(state)
        }
      }
    }

    return NextResponse.json({
      ...toPublicState(state),
      renderStatus: episode.renderStatus,
      renderMode: mode,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'render check failed' },
      { status: 500 }
    )
  }
}
