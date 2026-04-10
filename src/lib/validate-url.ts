import { URL } from 'url'
import dns from 'dns/promises'

/**
 * Validates that a URL points to a public internet host.
 * Blocks RFC1918, link-local, loopback, and metadata endpoints.
 */
export async function validatePublicUrl(urlString: string): Promise<{ valid: boolean; error?: string }> {
  let parsed: URL
  try {
    parsed = new URL(urlString)
  } catch {
    return { valid: false, error: 'Invalid URL' }
  }

  // Only allow http/https
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only HTTP(S) URLs allowed' }
  }

  // Block known metadata hostnames
  const blockedHosts = ['metadata.google.internal', 'metadata.google.com']
  if (blockedHosts.includes(parsed.hostname)) {
    return { valid: false, error: 'Blocked host' }
  }

  // Resolve hostname and check IP
  try {
    const { address } = await dns.lookup(parsed.hostname)
    if (isPrivateIP(address)) {
      return { valid: false, error: 'URL resolves to private IP' }
    }
  } catch {
    return { valid: false, error: 'DNS resolution failed' }
  }

  return { valid: true }
}

function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return true // IPv6 or invalid — block to be safe

  // Loopback: 127.0.0.0/8
  if (parts[0] === 127) return true
  // Link-local: 169.254.0.0/16
  if (parts[0] === 169 && parts[1] === 254) return true
  // RFC1918: 10.0.0.0/8
  if (parts[0] === 10) return true
  // RFC1918: 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  // RFC1918: 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true
  // 0.0.0.0
  if (parts.every(p => p === 0)) return true

  return false
}
