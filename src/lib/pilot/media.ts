import { createAdminClient } from '@/lib/supabase/admin'

const MEDIA_BUCKET = 'pilot-media'
export const MAX_PILOT_FRAME_BYTES = 5 * 1024 * 1024

export async function uploadPilotContinuityFrame(opts: {
  episodeId: string
  bytes: ArrayBuffer
  contentType: 'image/png' | 'image/jpeg'
}): Promise<string> {
  if (opts.bytes.byteLength > MAX_PILOT_FRAME_BYTES) {
    throw new Error('lastFrame exceeds 5 MB')
  }

  const sb = createAdminClient()
  await sb.storage.createBucket(MEDIA_BUCKET, {
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg'],
    fileSizeLimit: MAX_PILOT_FRAME_BYTES,
  }).then(({ error }) => {
    if (error && !/already exists|duplicate/i.test(error.message)) throw error
  })

  const ext = opts.contentType === 'image/jpeg' ? 'jpg' : 'png'
  const path = `continuity/${opts.episodeId}-${Date.now()}.${ext}`
  const { error } = await sb.storage.from(MEDIA_BUCKET).upload(
    path,
    Buffer.from(opts.bytes),
    {
      contentType: opts.contentType,
      upsert: false,
    }
  )
  if (error) throw new Error(`last-frame upload failed: ${error.message}`)

  return sb.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}
