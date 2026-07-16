import { NextRequest, NextResponse } from 'next/server'
import {
  updateState,
  toPublicState,
  yourVoteFor,
} from '@/lib/pilot/store'
import { continuityForWriteIn } from '@/lib/pilot/seed'
import { sanitizeForVideo } from '@/lib/pilot/video-prompt'
import type { PilotOption } from '@/lib/pilot/types'

export const dynamic = 'force-dynamic'

const VOTER_COOKIE = 'pilot_voter'
const MAX_CUSTOM_LABEL = 48
const MAX_CUSTOM_DETAIL = 100
const MAX_VISUAL_BEAT = 100
const MAX_STAGE = 220

function slugOptionId(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'custom'
  let id = `c-${base}`
  let n = 2
  while (existing.has(id)) {
    id = `c-${base}-${n++}`
  }
  return id
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      episodeId?: string
      optionId?: string
      customLabel?: string
      customDetail?: string
      customVisualBeat?: string
      customStageDirection?: string
    }
    const { episodeId } = body
    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId required' }, { status: 400 })
    }

    const customLabel = body.customLabel?.trim()
    const customDetail = body.customDetail?.trim()
    const customVisualBeat = body.customVisualBeat?.trim()
    const customStageDirection = body.customStageDirection?.trim()
    const safeVisualBeat = customVisualBeat
      ? sanitizeForVideo(customVisualBeat)
      : undefined
    const safeStageDirection = customStageDirection
      ? sanitizeForVideo(customStageDirection)
      : undefined
    if (customLabel && customLabel.length > MAX_CUSTOM_LABEL) {
      return NextResponse.json(
        { error: `custom label max ${MAX_CUSTOM_LABEL} chars` },
        { status: 400 }
      )
    }
    if (customDetail && customDetail.length > MAX_CUSTOM_DETAIL) {
      return NextResponse.json(
        { error: `custom detail max ${MAX_CUSTOM_DETAIL} chars` },
        { status: 400 }
      )
    }
    if (customVisualBeat && customVisualBeat.length > MAX_VISUAL_BEAT) {
      return NextResponse.json(
        { error: `visual beat max ${MAX_VISUAL_BEAT} chars` },
        { status: 400 }
      )
    }
    if (customStageDirection && customStageDirection.length > MAX_STAGE) {
      return NextResponse.json(
        { error: `stage direction max ${MAX_STAGE} chars` },
        { status: 400 }
      )
    }
    if (!body.optionId && !customLabel) {
      return NextResponse.json(
        { error: 'optionId or customLabel required' },
        { status: 400 }
      )
    }

    let voterId = req.cookies.get(VOTER_COOKIE)?.value
    const isNewVoter = !voterId
    if (!voterId) voterId = crypto.randomUUID()

    let votedOptionId = body.optionId || ''
    let alreadyVoted = false

    const state = await updateState((draft) => {
      const episode = draft.episodes.find((e) => e.id === episodeId)
      if (!episode) throw Object.assign(new Error('unknown episode'), { status: 404 })
      const current = draft.episodes[draft.episodes.length - 1]
      if (episode.id !== current.id || episode.winnerOptionId) {
        throw Object.assign(new Error('poll is closed'), { status: 409 })
      }
      if (episode.continuityReview?.status !== 'ready') {
        throw Object.assign(
          new Error(
            `actual rendered ending is still being reconciled (${episode.continuityReview?.status || 'needed'})`
          ),
          { status: 409 }
        )
      }

      draft.voters[episodeId] = draft.voters[episodeId] || {}
      const existing = draft.voters[episodeId][voterId!]
      if (existing) {
        alreadyVoted = true
        votedOptionId = existing
        return
      }

      if (customLabel) {
        const ids = new Set(episode.options.map((o) => o.id))
        const match = episode.options.find(
          (o) => o.label.toLowerCase() === customLabel.toLowerCase()
        )
        if (match) {
          votedOptionId = match.id
          match.votes += 1
          if (safeVisualBeat && !match.visualBeat) {
            match.visualBeat = safeVisualBeat
          }
          if (safeStageDirection && !match.stageDirection) {
            match.stageDirection = safeStageDirection
          }
          match.continuity ||= continuityForWriteIn(draft, episode, match)
        } else {
          const safeLabel = customLabel.replace(/[^\w\s]/g, '').trim()
          votedOptionId = slugOptionId(customLabel, ids)
          const writeIn: PilotOption = {
            id: votedOptionId,
            label: customLabel,
            detail: customDetail || 'Audience write-in',
            visualBeat:
              safeVisualBeat || `follows through on: ${safeLabel}`,
            stageDirection:
              safeStageDirection ||
              `Match the current final frame. Devon follows through on ${safeLabel || 'the audience choice'}. Hold the exact final body, prop, and motion state.`,
            votes: 1,
          }
          writeIn.continuity = continuityForWriteIn(draft, episode, writeIn)
          episode.options.push(writeIn)
        }
      } else {
        const option = episode.options.find((o) => o.id === body.optionId)
        if (!option) throw Object.assign(new Error('unknown option'), { status: 404 })
        votedOptionId = option.id
        option.votes += 1
      }

      draft.voters[episodeId][voterId!] = votedOptionId
    })

    const res = NextResponse.json({
      ...toPublicState(state),
      yourVote: votedOptionId || yourVoteFor(state, episodeId, voterId),
      alreadyVoted,
    })
    if (isNewVoter) {
      res.cookies.set(VOTER_COOKIE, voterId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
        path: '/',
      })
    }
    return res
  } catch (err) {
    const status =
      err && typeof err === 'object' && 'status' in err
        ? Number((err as { status: number }).status)
        : 500
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'vote failed' },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
