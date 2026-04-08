import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

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
          }

          return NextResponse.redirect(`${origin}/onboarding`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
