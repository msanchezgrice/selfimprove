import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { productionBibleFor } from '@/lib/pilot/continuity'
import { updateState } from '@/lib/pilot/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VOICE_BUCKET = 'pilot-voice'
const MAX_VOICE_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4']

/** Persist the one canonical Devon voice reference used by every spoken clip. */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const key = String(
      form.get('key') ||
        req.headers.get('authorization')?.replace('Bearer ', '') ||
        ''
    )
    if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const voiceReference = form.get('voiceReference')
    if (!(voiceReference instanceof File)) {
      return NextResponse.json({ error: 'voiceReference file required' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(voiceReference.type)) {
      return NextResponse.json(
        { error: 'voiceReference must be WAV, MP3, or M4A' },
        { status: 400 }
      )
    }
    if (voiceReference.size > MAX_VOICE_BYTES) {
      return NextResponse.json({ error: 'voiceReference exceeds 15 MB' }, { status: 413 })
    }

    const sb = createAdminClient()
    await sb.storage.createBucket(VOICE_BUCKET, {
      public: true,
      allowedMimeTypes: ALLOWED_TYPES,
      fileSizeLimit: MAX_VOICE_BYTES,
    }).then(({ error }) => {
      if (error && !/already exists|duplicate/i.test(error.message)) throw error
    })

    const ext = voiceReference.type.includes('mpeg')
      ? 'mp3'
      : voiceReference.type.includes('mp4')
        ? 'm4a'
        : 'wav'
    const path = `devon/reference-${Date.now()}.${ext}`
    const { error: uploadError } = await sb.storage
      .from(VOICE_BUCKET)
      .upload(path, Buffer.from(await voiceReference.arrayBuffer()), {
        contentType: voiceReference.type,
        upsert: false,
      })
    if (uploadError) throw new Error(`voice upload failed: ${uploadError.message}`)

    const { data } = sb.storage.from(VOICE_BUCKET).getPublicUrl(path)
    const referenceUrl = data.publicUrl
    await updateState((draft) => {
      draft.productionBible ||= productionBibleFor(draft)
      draft.productionBible.characters.devon.voice.referenceUrl = referenceUrl
    })

    return NextResponse.json({ ok: true, character: 'devon', referenceUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'voice reference failed' },
      { status: 500 }
    )
  }
}
