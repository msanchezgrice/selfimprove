import { NextRequest, NextResponse } from 'next/server'
import { getState, toPublicState, updateState } from '@/lib/pilot/store'
import { productionBibleFor } from '@/lib/pilot/continuity'
import {
  applyFrameReconciliation,
  reconcileRenderedFrames,
} from '@/lib/pilot/frame-reconciliation'
import {
  MAX_PILOT_FRAME_BYTES,
  uploadPilotContinuityFrame,
} from '@/lib/pilot/media'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png'])

function statusError(message: string, status: number) {
  return Object.assign(new Error(message), { status })
}

/**
 * Accept chronological near-end frames captured by the browser, observe the
 * real rendered boundary, and replace stale next choices before voting opens.
 */
export async function POST(req: NextRequest) {
  let episodeId = ''
  try {
    const form = await req.formData()
    episodeId = String(form.get('episodeId') || '')
    const frames = form.getAll('frames').filter((value): value is File => value instanceof File)
    if (!episodeId) throw statusError('episodeId required', 400)
    if (frames.length < 2 || frames.length > 3) {
      throw statusError('two or three chronological end frames required', 400)
    }
    for (const frame of frames) {
      if (!ALLOWED_TYPES.has(frame.type)) {
        throw statusError('frames must be JPEG or PNG', 400)
      }
      if (frame.size > MAX_PILOT_FRAME_BYTES) {
        throw statusError('each frame must be 5 MB or smaller', 413)
      }
    }

    const initial = await getState()
    const episode = initial.episodes.find((candidate) => candidate.id === episodeId)
    const current = initial.episodes[initial.episodes.length - 1]
    if (!episode) throw statusError('unknown episode', 404)
    if (episode.id !== current?.id || episode.winnerOptionId) {
      throw statusError('only the open current episode can be reconciled', 409)
    }
    if (episode.renderStatus !== 'done' || !episode.videoUrl) {
      throw statusError('episode render is not ready for reconciliation', 409)
    }
    if (episode.options.some((option) => option.votes > 0)) {
      throw statusError('cannot rewrite options after voting begins', 409)
    }
    if (episode.continuityReview?.status === 'ready') {
      return NextResponse.json({ ...toPublicState(initial), reconciled: true })
    }

    await updateState((draft) => {
      const target = draft.episodes.find((candidate) => candidate.id === episodeId)
      if (!target) throw statusError('unknown episode', 404)
      target.continuityReview = {
        status: 'analyzing',
        observedAt: null,
        confidence: null,
        travelPhase: null,
        completedActions: [],
        mismatches: [],
        evidence: [],
        error: null,
      }
    })

    const frameBuffers = await Promise.all(
      frames.map(async (frame) => ({
        mediaType: frame.type as 'image/jpeg' | 'image/png',
        data: Buffer.from(await frame.arrayBuffer()).toString('base64'),
      }))
    )
    const result = await reconcileRenderedFrames({
      episode,
      frames: frameBuffers,
      productionBible: productionBibleFor(initial),
    })

    const finalFrame = frames[frames.length - 1]
    const lastFrameUrl = await uploadPilotContinuityFrame({
      episodeId,
      bytes: await finalFrame.arrayBuffer(),
      contentType: finalFrame.type as 'image/jpeg' | 'image/png',
    })

    const state = await updateState((draft) => {
      const target = draft.episodes.find((candidate) => candidate.id === episodeId)
      const latest = draft.episodes[draft.episodes.length - 1]
      if (!target) throw statusError('unknown episode', 404)
      if (target.id !== latest?.id || target.winnerOptionId) {
        throw statusError('poll closed during reconciliation', 409)
      }
      if (target.options.some((option) => option.votes > 0)) {
        throw statusError('voting began during reconciliation', 409)
      }
      applyFrameReconciliation({
        episode: target,
        result,
        productionBible: productionBibleFor(draft),
        lastFrameUrl,
      })
    })

    return NextResponse.json({
      ...toPublicState(state),
      reconciled: true,
      review: state.episodes.find((candidate) => candidate.id === episodeId)?.continuityReview,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'continuity reconciliation failed'
    if (episodeId) {
      await updateState((draft) => {
        const target = draft.episodes.find((candidate) => candidate.id === episodeId)
        if (!target || target.continuityReview?.status === 'ready') return
        target.continuityReview = {
          status: 'failed',
          observedAt: null,
          confidence: null,
          travelPhase: null,
          completedActions: [],
          mismatches: [],
          evidence: [],
          error: message.slice(0, 240),
        }
      }).catch(() => undefined)
    }
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
