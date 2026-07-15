import { NextRequest, NextResponse } from 'next/server'
import { getState, saveState, toPublicState } from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'

const VOTER_COOKIE = 'pilot_voter'

export async function POST(req: NextRequest) {
  try {
    const { episodeId, optionId } = (await req.json()) as {
      episodeId?: string
      optionId?: string
    }
    if (!episodeId || !optionId) {
      return NextResponse.json({ error: 'episodeId and optionId required' }, { status: 400 })
    }

    const state = await getState()
    const episode = state.episodes.find((e) => e.id === episodeId)
    if (!episode) {
      return NextResponse.json({ error: 'unknown episode' }, { status: 404 })
    }
    const current = state.episodes[state.episodes.length - 1]
    if (episode.id !== current.id || episode.winnerOptionId) {
      return NextResponse.json({ error: 'poll is closed' }, { status: 409 })
    }
    const option = episode.options.find((o) => o.id === optionId)
    if (!option) {
      return NextResponse.json({ error: 'unknown option' }, { status: 404 })
    }

    let voterId = req.cookies.get(VOTER_COOKIE)?.value
    const isNewVoter = !voterId
    if (!voterId) voterId = crypto.randomUUID()

    state.voters[episodeId] = state.voters[episodeId] || {}
    const existing = state.voters[episodeId][voterId]

    if (!existing) {
      state.voters[episodeId][voterId] = optionId
      option.votes += 1
      await saveState(state)
    }

    const res = NextResponse.json({
      ...toPublicState(state),
      yourVote: existing || optionId,
      alreadyVoted: Boolean(existing),
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'vote failed' },
      { status: 500 }
    )
  }
}
