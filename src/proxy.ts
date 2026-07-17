import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { APP_ORIGIN } from '@/lib/app-routes'

const APP_PATHS = ['/login', '/auth', '/onboarding', '/dashboard']

function shouldUseAppOrigin(request: NextRequest): boolean {
  const isMarketingHost =
    request.nextUrl.hostname === 'shipsitself.com' ||
    request.nextUrl.hostname === 'www.shipsitself.com'
  const isAppPath = APP_PATHS.some(
    (path) =>
      request.nextUrl.pathname === path ||
      request.nextUrl.pathname.startsWith(`${path}/`),
  )
  return isMarketingHost && isAppPath
}

export async function proxy(request: NextRequest) {
  // Auth cookies and OAuth PKCE state cannot cross unrelated hostnames. Keep
  // every authenticated route on one origin while shipsitself.com remains the
  // public marketing site.
  if (shouldUseAppOrigin(request)) {
    const appUrl = new URL(request.nextUrl.pathname, APP_ORIGIN)
    appUrl.search = request.nextUrl.search
    return NextResponse.redirect(appUrl, 307)
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
