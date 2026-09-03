// @vitest-environment node
/**
 * Backup envelope encryption tests — Phase 3 §TESTS (Encryption).
 * Round-trip, wrong password, tamper detection, version rejection, and the
 * uniqueness of salt/IV/ciphertext across backups.
 */
import { describe, expect, it } from 'vitest'
import {
  BackupCryptoError,
  BACKUP_FORMAT_VERSION,
  decryptBackup,
  encryptBackup,
} from './crypto'

const PASSWORD = 'correct horse battery staple'
const PLAINTEXT = new TextEncoder().encode('SQLite format 3\u0000 — pretend user data'.repeat(50))

describe('backup envelope encryption (AES-256-GCM + PBKDF2)', () => {
  it('round-trips: correct password decrypts the exact plaintext', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    const { plaintext, header } = await decryptBackup(envelope, PASSWORD)
    expect(Buffer.from(plaintext).equals(Buffer.from(PLAINTEXT))).toBe(true)
    expect(header.version).toBe(BACKUP_FORMAT_VERSION)
  })

  it('stores no plaintext and no SQLite magic in the envelope', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    const asText = Buffer.from(envelope).toString('latin1')
    expect(asText).not.toContain('SQLite format 3')
    expect(asText).not.toContain('pretend user data')
    expect(asText).not.toContain(PASSWORD)
  })

  it('rejects a wrong password (GCM authentication failure)', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    await expect(decryptBackup(envelope, 'wrong password')).rejects.toBeInstanceOf(BackupCryptoError)
  })

  it('rejects a tampered ciphertext (corruption detected)', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    const tampered = new Uint8Array(envelope)
    tampered[tampered.length - 1] ^= 0x01 // flip one bit of the tag
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toBeInstanceOf(BackupCryptoError)
  })

  it('rejects a truncated / corrupt envelope', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    await expect(decryptBackup(envelope.subarray(0, 20), PASSWORD)).rejects.toBeInstanceOf(BackupCryptoError)
    await expect(decryptBackup(new Uint8Array([1, 2, 3]), PASSWORD)).rejects.toBeInstanceOf(BackupCryptoError)
  })

  it('rejects unsupported backup format versions cleanly', async () => {
    const envelope = await encryptBackup(PLAINTEXT, PASSWORD)
    // Patch the header's version field inside the envelope.
    const headerStart = 'P2BACKUP'.length + 4
    const headerLen = new DataView(envelope.buffer, envelope.byteOffset).getUint32('P2BACKUP'.length, true)
    const headerJson = new TextDecoder().decode(envelope.subarray(headerStart, headerStart + headerLen))
    const patched = JSON.stringify({ ...JSON.parse(headerJson), version: 999 })
    const patchedBytes = new TextEncoder().encode(patched)
    const out = new Uint8Array(envelope.length - headerLen + patchedBytes.length)
    out.set(envelope.subarray(0, headerStart))
    out.set(new Uint8Array(4).map((_, i) => (patchedBytes.length >> (8 * i)) & 0xff), 'P2BACKUP'.length)
    out.set(patchedBytes, headerStart)
    out.set(envelope.subarray(headerStart + headerLen), headerStart + patchedBytes.length)
    await expect(decryptBackup(out, PASSWORD)).rejects.toThrow(/Unsupported backup version/)
  })

  it('uses a unique random salt + IV per backup (same input → different ciphertext)', async () => {
    const a = await encryptBackup(PLAINTEXT, PASSWORD)
    const b = await encryptBackup(PLAINTEXT, PASSWORD)
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false)
    const { header: ha } = await decryptBackup(a, PASSWORD)
    const { header: hb } = await decryptBackup(b, PASSWORD)
    expect(ha.salt).not.toBe(hb.salt)
    expect(ha.iv).not.toBe(hb.iv)
  })

  it('both ciphertexts still decrypt to the same plaintext', async () => {
    const a = await encryptBackup(PLAINTEXT, PASSWORD)
    const b = await encryptBackup(PLAINTEXT, PASSWORD)
    const pa = (await decryptBackup(a, PASSWORD)).plaintext
    const pb = (await decryptBackup(b, PASSWORD)).plaintext
    expect(Buffer.from(pa).equals(Buffer.from(pb))).toBe(true)
  })
})