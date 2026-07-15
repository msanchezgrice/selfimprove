import { NextRequest, NextResponse } from 'next/server'
import { updateState } from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'

/**
 * Attach a rendered video to an episode (or mark its render failed).
 * Used by the nightly render session, which generates video through the
 * Higgsfield *consumer* app (CLI / MCP — funded account) and reports back
 * here. Keyed GET so it works from environments that can only make simple
 * GET requests.
 *
 *   GET /api/pilot/attach?key=CRON_SECRET&episodeId=ep-2&url=<encoded mp4 url>
 *   GET /api/pilot/attach?key=CRON_SECRET&episodeId=ep-2&failed=1
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const key = params.get('key') || req.headers.get('authorization')?.replace('Bearer ', '')
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const episodeId = params.get('episodeId')
  const url = params.get('url')
  const failed = params.get('failed')
  if (!episodeId || (!url && !failed)) {
    return NextResponse.json({ error: 'episodeId and url (or failed=1) required' }, { status: 400 })
  }

  try {
    const state = await updateState((draft) => {
      const episode = draft.episodes.find((e) => e.id === episodeId)
      if (!episode) throw Object.assign(new Error('unknown episode'), { status: 404 })

      if (url) {
        let videoUrl: string
        try {
          videoUrl = new URL(url).toString()
        } catch {
          throw Object.assign(new Error('url must be a valid absolute URL'), { status: 400 })
        }
        episode.videoUrl = videoUrl
        episode.renderStatus = 'done'
      } else {
        episode.renderStatus = 'failed'
      }
    })

    const episode = state.episodes.find((e) => e.id === episodeId)!
    return NextResponse.json({
      ok: true,
      episodeId,
      renderStatus: episode.renderStatus,
      videoUrl: episode.videoUrl,
    })
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'attach failed' },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
