export const DEFAULT_SITE_URL = 'https://shipsitself.com'

export function getSiteUrl(value = process.env.NEXT_PUBLIC_APP_URL): string {
  const configured = value?.trim()
  if (!configured) return DEFAULT_SITE_URL

  return configured.replace(/\/+$/, '')
}

export function getEmailFromAddress(
  value = process.env.RESEND_FROM_EMAIL,
): string | null {
  const configured = value?.trim()
  if (!configured) return null

  return configured.includes('<')
    ? configured
    : `Ships Itself <${configured}>`
}

export const SITE_URL = getSiteUrl()
