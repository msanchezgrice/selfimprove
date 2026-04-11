import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error('TOKEN_ENCRYPTION_KEY env var required')
  return Buffer.from(key, 'hex')
}

function decrypt(ciphertext: string): string {
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':')
  if (!ivHex || !tagHex || !encryptedHex) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

/** Decrypt only if the value looks encrypted (handles plaintext during migration) */
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
