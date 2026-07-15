import { NextRequest, NextResponse } from 'next/server'
import {
  updateState,
  toPublicState,
  yourVoteFor,
} from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'

const VOTER_COOKIE = 'pilot_voter'
const MAX_CUSTOM_LABEL = 48
const MAX_CUSTOM_DETAIL = 100
const MAX_VISUAL_BEAT = 100

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
    }
    const { episodeId } = body
    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId required' }, { status: 400 })
    }

    const customLabel = body.customLabel?.trim()
    const customDetail = body.customDetail?.trim()
    const customVisualBeat = body.customVisualBeat?.trim()
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
          if (customVisualBeat && !match.visualBeat) {
            match.visualBeat = customVisualBeat
          }
        } else {
          votedOptionId = slugOptionId(customLabel, ids)
          episode.options.push({
            id: votedOptionId,
            label: customLabel,
            detail: customDetail || 'Audience write-in',
            visualBeat:
              customVisualBeat ||
              `follows through on: ${customLabel.replace(/[^\w\s]/g, '').trim()}`,
            votes: 1,
          })
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
