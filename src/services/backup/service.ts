/**
 * Backup & Restore service (features/settings §Backup & Restore).
 *
 * A backup is the COMPLETE SQLite user-data image (the same persistence
 * snapshot the app itself writes — settings, farmers, rice types, prices,
 * purchases, bags, moisture configs, with all FK relationships intact),
 * serialized and encrypted with AES-256-GCM via `./crypto` (PBKDF2-SHA256
 * key derived from the user's backup password). The file is never plain
 * readable JSON.
 *
 * Restore validates the envelope (magic → version → GCM authentication →
 * SQLite header → schema probe) BEFORE any swap; a failed restore leaves the
 * live database untouched. The actual replacement reuses the existing
 * persistence architecture (`connection.reopenDatabase` + `persistence.flushSave`).
 *
 * No business rules here: the SQLite image IS the user data — purchases and
 * totals are restored exactly as they were saved.
 */
import type { Database } from 'sql.js'
import { exportDatabaseBytes, isSqliteBytes, probeDatabase, reopenDatabase } from '@/infrastructure/db/connection'
import { flushSave } from '@/infrastructure/db/persistence'
import { createPdfStorage } from '@/infrastructure/platform/fs'
import { encryptBackup, decryptBackup, BACKUP_FORMAT_VERSION } from './crypto'

export const BACKUP_EXTENSION = 'p2bak'
const BACKUP_DIR = 'backup'

export { BACKUP_FORMAT_VERSION }

export interface BackupResult {
  /** Saved file path/URI (platform-dependent: download on web, Documents + share on Android). */
  path: string
  createdAt: string
}

/** Build the encrypted backup envelope from the live database image. */
export async function createBackupEnvelope(_db: Database, password: string): Promise<Uint8Array> {
  // Export the live in-memory image — the authoritative, complete user data.
  const bytes = exportDatabaseBytes()
  if (!isSqliteBytes(bytes)) {
    throw new Error('Internal error: database image is not a valid SQLite file')
  }
  return encryptBackup(bytes, password)
}

/**
 * Create + save a backup file. Returns the saved path. On web this triggers
 * a download; on Android the file is written to Documents and offered via
 * the native share sheet (existing StoragePort behavior — no new platform code).
 */
export async function createBackupFile(db: Database, password: string): Promise<BackupResult> {
  const envelope = await createBackupEnvelope(db, password)
  const createdAt = new Date().toISOString()
  const storage = createPdfStorage()
  const filename = `paddy_backup_${createdAt.slice(0, 10)}.${BACKUP_EXTENSION}`
  const saved = await storage.saveBinaryFile(`${BACKUP_DIR}/${filename}`, envelope)
  return { path: saved.path, createdAt }
}

/**
 * Validate + decrypt + swap the live database with the backup's image.
 *
 * Order (spec §RESTORE SAFETY): every validation runs BEFORE the swap —
 * wrong password, corruption, tampering, or an unsupported version all throw
 * here and the existing database is left completely untouched. After the
 * (atomic, in-memory) swap the restored image is persisted through the
 * existing persistence adapter. The caller refreshes the app afterwards so
 * all stores reload from the restored database.
 */
export async function restoreBackupFromBytes(
  _db: Database,
  envelope: Uint8Array,
  password: string,
): Promise<void> {
  // 1) Envelope format/version + password + authenticity (GCM tag).
  const { plaintext } = await decryptBackup(envelope, password)
  // 2) Decrypted payload must be a SQLite database image.
  if (!isSqliteBytes(plaintext)) {
    throw new Error('Backup does not contain a valid database')
  }
  // 3) Full structural probe in a throwaway connection — the live database
  //    is still untouched if this fails.
  const probe = probeDatabase(plaintext)
  if (!probe.ok) {
    throw new Error(`Invalid backup database: ${probe.error}`)
  }
  // 4) Atomic in-memory swap (old connection closed only after validation).
  reopenDatabase(plaintext)
  // 5) Persist the restored image via the existing persistence adapter.
  await flushSave()
}