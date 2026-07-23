import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { APP_ORIGIN } from '@/lib/app-routes'

const RETIRED_APP_HOSTS = new Set(['selfimprove-iota.vercel.app'])

export async function proxy(request: NextRequest) {
  // Ships Itself is now the only production origin. Preserve the entire path
  // and query for old bookmarks while retiring the Vercel hostname.
  if (RETIRED_APP_HOSTS.has(request.nextUrl.hostname)) {
    const canonicalUrl = new URL(request.nextUrl.pathname, APP_ORIGIN)
    canonicalUrl.search = request.nextUrl.search
    return NextResponse.redirect(canonicalUrl, 308)
  }

  // Rescue stray OAuth codes. If the Supabase redirect allowlist is ever out
  // of sync with this origin, GoTrue falls back to its configured Site URL and
  // the auth code lands on the wrong path (usually "/"), silently dropping the
  // sign-in. Forward any such code to the callback route so login still
  // completes. Only /auth/callback consumes a `code` query param today.
  if (
    request.nextUrl.searchParams.has('code') &&
    request.nextUrl.pathname !== '/auth/callback' &&
    !request.nextUrl.pathname.startsWith('/api/')
  ) {
    const rescueUrl = request.nextUrl.clone()
    rescueUrl.pathname = '/auth/callback'
    return NextResponse.redirect(rescueUrl)
  }

  let supabaseResponse = NextResponse.next({ request })

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return supabaseResponse
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
