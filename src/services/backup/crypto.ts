/**
 * Authenticated encryption for backup files — infrastructure-level crypto,
 * no project imports (AGENTS §4: pure WebCrypto serialization + encryption
 * with no UI/db/platform dependencies).
 *
 * Design (docs task spec §BACKUP SECURITY):
 *   plaintext (SQLite bytes)
 *     → key = PBKDF2-HMAC-SHA256(password, salt, 310_000, 256-bit)
 *     → AES-256-GCM (96-bit IV) authenticated encryption
 *     → binary envelope: magic + header JSON (kdf/cipher metadata, salt, iv)
 *       followed by ciphertext||tag
 *
 * A fresh random salt (16B) and IV (12B) are generated for EVERY backup.
 * The password is never stored, logged, or derived from anything else.
 * Wrong password / tampered ciphertext → GCM authentication fails → the
 * caller receives a BackupCryptoError and the data is rejected.
 */

const BACKUP_MAGIC = 'P2BACKUP'
const KDF = 'PBKDF2-SHA256'
const CIPHER = 'AES-256-GCM'
/** OWASP-recommended PBKDF2-SHA256 iteration floor for password storage. */
export const PBKDF2_ITERATIONS = 310_000
const SALT_BYTES = 16
const IV_BYTES = 12
const KEY_BITS = 256

export const BACKUP_FORMAT_VERSION = 1

/** Header metadata stored INSIDE the envelope (no secrets, no password). */
export interface BackupHeader {
  version: number
  created_at: string
  kdf: typeof KDF
  iterations: number
  cipher: typeof CIPHER
  /** base64 salt / IV. */
  salt: string
  iv: string
}

/** Distinguishes authentication/format failures from unexpected errors. */
export class BackupCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupCryptoError'
  }
}

function bytesToBase64(data: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  )
}
/**
 * Serialize + encrypt `plaintext` into a versioned binary envelope.
 */
export async function encryptBackup(
  plaintext: Uint8Array,
  password: string,
  createdAt: string = new Date().toISOString(),
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      plaintext as unknown as BufferSource,
    ),
  )

  const header: BackupHeader = {
    version: BACKUP_FORMAT_VERSION,
    created_at: createdAt,
    kdf: KDF,
    iterations: PBKDF2_ITERATIONS,
    cipher: CIPHER,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))

  const magicBytes = new TextEncoder().encode(BACKUP_MAGIC)
  const lengthBytes = new Uint8Array(4)
  new DataView(lengthBytes.buffer).setUint32(0, headerBytes.length, true)

  const envelope = new Uint8Array(magicBytes.length + 4 + headerBytes.length + ciphertext.length)
  let offset = 0
  envelope.set(magicBytes, offset)
  offset += magicBytes.length
  envelope.set(lengthBytes, offset)
  offset += 4
  envelope.set(headerBytes, offset)
  offset += headerBytes.length
  envelope.set(ciphertext, offset)
  return envelope
}

/**
 * Parse + authenticate + decrypt an envelope. Throws `BackupCryptoError`
 * for unknown format/versions, corruption, tampering, or a wrong password —
 * all rejected before any data is returned.
 */
export async function decryptBackup(
  envelope: Uint8Array,
  password: string,
): Promise<{ plaintext: Uint8Array; header: BackupHeader }> {
  const magicBytes = new TextEncoder().encode(BACKUP_MAGIC)
  if (
    envelope.length < magicBytes.length + 4 ||
    !magicBytes.every((b, i) => envelope[i] === b)
  ) {
    throw new BackupCryptoError('Not a P2 backup file')
  }

  const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength)
  const headerLength = view.getUint32(magicBytes.length, true)
  const headerStart = magicBytes.length + 4
  const cipherStart = headerStart + headerLength
  if (headerLength > envelope.length - headerStart || cipherStart > envelope.length) {
    throw new BackupCryptoError('Corrupt backup file')
  }

  let header: BackupHeader
  try {
    header = JSON.parse(new TextDecoder().decode(envelope.subarray(headerStart, cipherStart))) as BackupHeader
  } catch {
    throw new BackupCryptoError('Corrupt backup file')
  }
  if (header.version !== BACKUP_FORMAT_VERSION) {
    throw new BackupCryptoError(`Unsupported backup version: ${String(header.version)}`)
  }
  if (header.kdf !== KDF || header.cipher !== CIPHER || !header.salt || !header.iv) {
    throw new BackupCryptoError('Unsupported backup encryption parameters')
  }

  const salt = base64ToBytes(header.salt)
  const iv = base64ToBytes(header.iv)
  const key = await deriveKey(password, salt, header.iterations)
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      envelope.subarray(cipherStart) as unknown as BufferSource,
    )
    return { plaintext: new Uint8Array(plaintext), header }
  } catch {
    // GCM tag mismatch: wrong password OR tampered/corrupted ciphertext.
    throw new BackupCryptoError('Wrong password or corrupted backup')
  }
}