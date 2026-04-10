import crypto from 'crypto'

/**
 * Timing-safe comparison of two secret strings.
 * Prevents timing attacks by using constant-time comparison.
 */
export function verifySecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Verify a GitHub webhook HMAC-SHA256 signature.
 * Returns true if the signature matches the expected HMAC of the body.
 */
export function verifyGitHubSignature(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex')
  const sig = Buffer.from(signature)
  const exp = Buffer.from(expected)
  if (sig.length !== exp.length) return false
  return crypto.timingSafeEqual(sig, exp)
}
