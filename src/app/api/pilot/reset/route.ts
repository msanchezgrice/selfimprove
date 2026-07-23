import { NextRequest, NextResponse } from 'next/server'
import { getState, saveState } from '@/lib/pilot/store'
import { seedState } from '@/lib/pilot/seed'

export const dynamic = 'force-dynamic'

/**
 * Showrunner reset controls (keyed with CRON_SECRET).
 *
 * Reset one episode's video (clears it for re-render):
 *   GET /api/pilot/reset?key=CRON_SECRET&episodeId=ep-3
 *
 * Start the show from scratch (explicitly requested by the owner —
 * wipes all episodes/votes back to a fresh Episode 1):
 *   GET /api/pilot/reset?key=CRON_SECRET&all=1&confirm=yes
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const key = params.get('key') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (params.get('all') === '1') {
    if (params.get('confirm') !== 'yes') {
      return NextResponse.json(
        { error: 'add &confirm=yes to wipe the show back to a fresh Episode 1' },
        { status: 400 }
      )
    }
    const fresh = seedState()
    await saveState(fresh)
    return NextResponse.json({ ok: true, reset: 'all', episodes: fresh.episodes.length })
  }

  const episodeId = params.get('episodeId')
  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId required (or all=1&confirm=yes)' }, { status: 400 })
  }

  const state = await getState()
  const episode = state.episodes.find((e) => e.id === episodeId)
  if (!episode) {
    return NextResponse.json({ error: 'unknown episode' }, { status: 404 })
  }

  episode.videoUrl = null
  episode.renderStatus = 'none'
  episode.hfRequestId = null
  await saveState(state)

  return NextResponse.json({ ok: true, reset: episodeId, renderStatus: episode.renderStatus })
}
