import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWelcomeEmail } from '@/lib/notifications'
import { encrypt } from '@/lib/crypto'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const next = searchParams.get('next') ?? '/dashboard'

  // Magic link flow (CLI-created users)
  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as 'magiclink',
    })
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=invalid_link`)
    }
    return NextResponse.redirect(`${origin}${next}`)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user) {
        // Use admin client to bypass RLS for first-time user setup
        const admin = createAdminClient()

        // Persist GitHub provider_token so it survives JWT refresh
        const { data: { session } } = await supabase.auth.getSession()
        const providerToken = session?.provider_token
        if (providerToken) {
          await admin
            .from('org_members')
            .update({ github_token: encrypt(providerToken) })
            .eq('user_id', user.id)
        }

        const { data: membership } = await admin
          .from('org_members')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .single()

        if (!membership) {
          const displayName =
            user.user_metadata?.full_name ||
            user.email?.split('@')[0] ||
            'My Team'
          const slug = displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')

          const { data: org } = await admin
            .from('orgs')
            .insert({
              name: `${displayName}'s Team`,
              slug: `${slug}-${Date.now()}`,
            })
            .select('id')
            .single()

          if (org) {
            await admin
              .from('org_members')
              .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

            // Send welcome email (fire-and-forget)
            sendWelcomeEmail(user.id, org.id).catch(() => {})
          }

          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
