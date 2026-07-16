import { NextRequest, NextResponse } from 'next/server'
import { updateState } from '@/lib/pilot/store'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MEDIA_BUCKET = 'pilot-media'
const MAX_FRAME_BYTES = 5 * 1024 * 1024

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

/**
 * Production attach path. The renderer uploads the exact extracted final frame
 * alongside the video URL so the following episode can use a real boundary
 * image rather than a generic thumbnail.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const key = String(form.get('key') || req.headers.get('authorization')?.replace('Bearer ', '') || '')
    if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const episodeId = String(form.get('episodeId') || '')
    const url = String(form.get('url') || '')
    const lastFrame = form.get('lastFrame')
    if (!episodeId || !url || !(lastFrame instanceof File)) {
      return NextResponse.json(
        { error: 'episodeId, url, and lastFrame file required' },
        { status: 400 }
      )
    }

    let videoUrl: string
    try {
      videoUrl = new URL(url).toString()
    } catch {
      return NextResponse.json({ error: 'url must be a valid absolute URL' }, { status: 400 })
    }

    if (!['image/png', 'image/jpeg'].includes(lastFrame.type)) {
      return NextResponse.json({ error: 'lastFrame must be PNG or JPEG' }, { status: 400 })
    }
    if (lastFrame.size > MAX_FRAME_BYTES) {
      return NextResponse.json({ error: 'lastFrame exceeds 5 MB' }, { status: 413 })
    }

    const sb = createAdminClient()
    await sb.storage.createBucket(MEDIA_BUCKET, {
      public: true,
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      fileSizeLimit: MAX_FRAME_BYTES,
    }).then(({ error }) => {
      if (error && !/already exists|duplicate/i.test(error.message)) throw error
    })

    const ext = lastFrame.type === 'image/jpeg' ? 'jpg' : 'png'
    const path = `continuity/${episodeId}-${Date.now()}.${ext}`
    const { error: uploadError } = await sb.storage
      .from(MEDIA_BUCKET)
      .upload(path, Buffer.from(await lastFrame.arrayBuffer()), {
        contentType: lastFrame.type,
        upsert: false,
      })
    if (uploadError) throw new Error(`last-frame upload failed: ${uploadError.message}`)

    const { data: publicData } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path)
    const lastFrameUrl = publicData.publicUrl

    const state = await updateState((draft) => {
      const episode = draft.episodes.find((e) => e.id === episodeId)
      if (!episode) throw Object.assign(new Error('unknown episode'), { status: 404 })
      episode.videoUrl = videoUrl
      episode.posterUrl = lastFrameUrl
      episode.lastFrameUrl = lastFrameUrl
      episode.renderStatus = 'done'
    })

    const episode = state.episodes.find((e) => e.id === episodeId)!
    return NextResponse.json({
      ok: true,
      episodeId,
      renderStatus: episode.renderStatus,
      videoUrl: episode.videoUrl,
      lastFrameUrl: episode.lastFrameUrl,
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
