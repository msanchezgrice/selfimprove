export const DEFAULT_APP_ORIGIN = 'https://shipsitself.com'
export const DEFAULT_DASHBOARD_PATH = '/dashboard'
export const OWNER_DASHBOARD_PATH = '/dashboard/selfimprove/roadmap'
const RETIRED_APP_HOSTS = new Set(['selfimprove-iota.vercel.app'])

export function getAppOrigin(value: string | undefined): string {
  const configured = value?.trim()
  if (!configured) return DEFAULT_APP_ORIGIN

  try {
    const url = new URL(configured)
    const isLocalHttp = url.protocol === 'http:' && url.hostname === 'localhost'
    if (
      (url.protocol !== 'https:' && !isLocalHttp) ||
      RETIRED_APP_HOSTS.has(url.hostname)
    ) {
      return DEFAULT_APP_ORIGIN
    }
    return url.origin
  } catch {
    return DEFAULT_APP_ORIGIN
  }
}

export const APP_ORIGIN = getAppOrigin(
  process.env.NEXT_PUBLIC_DASHBOARD_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_URL,
)
export const LOGIN_URL = `${APP_ORIGIN}/login`
export const OWNER_DASHBOARD_URL = `${APP_ORIGIN}${OWNER_DASHBOARD_PATH}`

export function getSafeAuthNextPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_DASHBOARD_PATH
  }

  try {
    const url = new URL(value, APP_ORIGIN)
    if (url.origin !== APP_ORIGIN) return DEFAULT_DASHBOARD_PATH
    if (
      !url.pathname.startsWith('/dashboard') &&
      url.pathname !== '/onboarding'
    ) {
      return DEFAULT_DASHBOARD_PATH
    }
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return DEFAULT_DASHBOARD_PATH
  }
}

export function getAuthCallbackUrl(
  next = DEFAULT_DASHBOARD_PATH,
  provider?: 'github' | 'google',
): string {
  const callback = new URL('/auth/callback', APP_ORIGIN)
  callback.searchParams.set('next', getSafeAuthNextPath(next))
  if (provider) callback.searchParams.set('provider', provider)
  return callback.toString()
}
