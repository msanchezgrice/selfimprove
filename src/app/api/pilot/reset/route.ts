import { NextResponse } from 'next/server'
import { getState, saveState, toPublicState } from '@/lib/pilot/store'
import { seedState } from '@/lib/pilot/seed'

export const dynamic = 'force-dynamic'

/**
 * Wipe /pilot back to episode 1. Public on purpose for this prototype —
 * the page confirms before calling.
 */
export async function POST() {
  try {
    const prev = await getState().catch(() => null)
    const seeded = seedState()
    // Keep rotating consumer OAuth across season resets.
    if (prev?.higgsfieldAuth) {
      seeded.higgsfieldAuth = prev.higgsfieldAuth
    }
    // A season reset clears story progress, not the approved production assets
    // that keep Devon recognizable and sounding like the same character.
    const previousDevon = prev?.productionBible?.characters.devon
    const seededDevon = seeded.productionBible?.characters.devon
    if (previousDevon && seededDevon) {
      seededDevon.identityReferenceUrl =
        previousDevon.identityReferenceUrl || seededDevon.identityReferenceUrl
      seededDevon.identityElementId =
        previousDevon.identityElementId || seededDevon.identityElementId
      seededDevon.voice.referenceUrl =
        previousDevon.voice.referenceUrl || seededDevon.voice.referenceUrl
      seededDevon.voice.voiceId =
        previousDevon.voice.voiceId || seededDevon.voice.voiceId
    }
    await saveState(seeded)
    return NextResponse.json({
      ...toPublicState(seeded),
      yourVote: null,
      alreadyVoted: false,
      reset: true,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'reset failed' },
      { status: 500 }
    )
  }
}
