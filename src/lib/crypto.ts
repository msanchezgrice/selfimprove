import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY env var required')
  // Key should be 32 bytes (64 hex chars)
  return Buffer.from(key, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

// Helper: encrypt only if not already encrypted (idempotent)
export function encryptIfNeeded(value: string): string {
  if (value.includes(':') && value.split(':').length === 3 && value.split(':')[0].length === 32) {
    return value // already encrypted
  }
  return encrypt(value)
}

// Helper: decrypt only if encrypted (handles plaintext gracefully during migration)
export function decryptIfNeeded(value: string): string {
  if (!value.includes(':') || value.split(':').length !== 3) {
    return value // plaintext (pre-migration)
  }
  try {
    return decrypt(value)
  } catch {
    return value // not actually encrypted, return as-is
  }
}
