import { NextRequest, NextResponse } from 'next/server'
import { getState, saveState, toPublicState, getRenderMode } from '@/lib/pilot/store'
import { checkRender } from '@/lib/pilot/higgsfield'
import { DEVON_SEED_IMAGE } from '@/lib/pilot/seed'
import { buildCoherentVideoPrompt } from '@/lib/pilot/video-prompt'

export const dynamic = 'force-dynamic'

/**
 * Poll / inspect render status.
 *
 * Keyed GET returns the oldest pending session-mode job for the consumer
 * render worker, with a rebuilt coherent videoPrompt:
 *   GET /api/pilot/render?key=CRON_SECRET&pending=1
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

    const videoPrompt = buildCoherentVideoPrompt({
      script: pending.script,
      mood: state.character.mood,
      visualBeat: pending.options.find((o) => o.id === pending.winnerOptionId)?.visualBeat,
    })
    if (videoPrompt !== pending.videoPrompt) {
      pending.videoPrompt = videoPrompt
      await saveState(state)
    }

    return NextResponse.json({
      pending: {
        episodeId: pending.id,
        number: pending.number,
        title: pending.title,
        videoPrompt,
        seedImageUrl: pending.posterUrl || DEVON_SEED_IMAGE,
        script: pending.script,
      },
    })
  }

  return NextResponse.json({ renderMode: getRenderMode() })
}

export async function POST(req: NextRequest) {
  try {
    const { episodeId } = (await req.json()) as { episodeId?: string }
    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId required' }, { status: 400 })
    }

    const state = await getState()
    const episode = state.episodes.find((e) => e.id === episodeId)
    if (!episode) {
      return NextResponse.json({ error: 'unknown episode' }, { status: 404 })
    }

    if (
      getRenderMode() === 'api' &&
      episode.renderStatus === 'rendering' &&
      episode.hfRequestId
    ) {
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

    return NextResponse.json({
      ...toPublicState(state),
      renderStatus: episode.renderStatus,
      renderMode: getRenderMode(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'render check failed' },
      { status: 500 }
    )
  }
}
