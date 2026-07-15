import { NextRequest, NextResponse } from 'next/server'
import { getState, saveState, toPublicState } from '@/lib/pilot/store'
import { checkRender } from '@/lib/pilot/higgsfield'

export const dynamic = 'force-dynamic'

/**
 * Poll the render status of an episode. Called by the client every few
 * seconds after a cycle until the video lands (renders take 2-5 minutes).
 */
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

    if (episode.renderStatus === 'rendering' && episode.hfRequestId) {
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
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'render check failed' },
      { status: 500 }
    )
  }
}
