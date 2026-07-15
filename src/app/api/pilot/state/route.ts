import { NextResponse } from 'next/server'
import { getState, toPublicState } from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const state = await getState()
    return NextResponse.json(toPublicState(state), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to load state' },
      { status: 500 }
    )
  }
}
