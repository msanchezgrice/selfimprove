const rateLimit = new Map<string, { count: number; resetTime: number }>()

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetIn: number } {
  const now = Date.now()
  const entry = rateLimit.get(key)

  if (!entry || now > entry.resetTime) {
    rateLimit.set(key, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: limit - 1, resetIn: windowMs }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetIn: entry.resetTime - now }
  }

  entry.count++
  return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetTime - now }
}

// Periodic cleanup to prevent memory leaks from expired entries
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

function cleanupExpiredEntries() {
  const now = Date.now()
  for (const [key, entry] of rateLimit) {
    if (now > entry.resetTime) {
      rateLimit.delete(key)
    }
  }
}

setInterval(cleanupExpiredEntries, CLEANUP_INTERVAL_MS).unref()
