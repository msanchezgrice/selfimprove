import { NextRequest, NextResponse } from 'next/server'
import { getState, toPublicState, yourVoteFor } from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'

const VOTER_COOKIE = 'pilot_voter'

export async function GET(req: NextRequest) {
  try {
    const state = await getState()
    const currentId = state.episodes.length
      ? state.episodes[state.episodes.length - 1].id
      : null
    const voterId = req.cookies.get(VOTER_COOKIE)?.value
    const yourVote = yourVoteFor(state, currentId, voterId)
    return NextResponse.json(
      {
        ...toPublicState(state),
        yourVote,
        alreadyVoted: Boolean(yourVote),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to load state' },
      { status: 500 }
    )
  }
}
