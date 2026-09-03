// @vitest-environment node
/**
 * Backup & Restore service tests — Phase 3 §TESTS.
 *
 * Covers: backup creation (encrypted, complete user data), restore round-trip
 * (restored data matches the original), wrong password / corruption rejection
 * with existing data left intact, and the failed-restore safety guarantee.
 */
import { afterAll, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import {
  closeDatabase,
  exportDatabaseBytes,
  getDatabase,
  isSqliteBytes,
  openDatabase,
  probeDatabase,
} from '@/infrastructure/db/connection'
import { runMigrations } from '@/infrastructure/db/migrations'
import { createFarmer } from '@/infrastructure/db/dao/farmers'
import { createRiceType } from '@/infrastructure/db/dao/riceTypes'
import { setMoistureConfig } from '@/infrastructure/db/dao/moistureConfigs'
import { createPurchase, listPurchases } from '@/infrastructure/db/dao/purchases'
import { closeTestDatabase, createTestDatabase } from '@/infrastructure/db/test-support'
import { decryptBackup, encryptBackup } from './crypto'
import { createBackupEnvelope, restoreBackupFromBytes } from './service'

const PASSWORD = 'restore-test-passphrase'

/** Seed a small but complete user dataset (settings/farmers/types/config/purchase). */
function seed(db: Database): { farmerId: number } {
  const farmer = createFarmer(db, { name: 'Daw Mya', phone: '09780001111' })
  const type = createRiceType(db, { name: 'Emata(50)' })
  setMoistureConfig(db, { farmer_id: farmer.id, rice_type_id: type.id, status: 'active', label: 18 })
  createPurchase(db, {
    snapshot: {
      id: 0,
      purchase_no: 'PSO-202601-0001',
      date: '2026-01-10',
      farmer_id: farmer.id,
      farmer_name: farmer.name,
      rice_type_id: type.id,
      rice_type_name: type.name,
      price_100_tin: 1080000,
      price_per_tin: 10800,
      total_bags: 10,
      total_pounds: 500,
      total_tins: 10,
      total_amount: 108000,
      gross_pound: 505,
      moisture_loss: 20,
      net_pound: 485,
      moisture_label: 18,
      moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
      finalized: false,
      pdf_path: null,
    },
    bags: [{ weight_lb: 50.5, moisture_label: 18 }],
  })
  return { farmerId: farmer.id }
}

describe('backup service (Phase 3)', () => {
  afterAll(() => closeTestDatabase())

  it('creates a backup envelope that is encrypted, not plaintext SQLite', async () => {
    await createTestDatabase()
    seed(getDatabase())
    const envelope = await createBackupEnvelope(getDatabase(), PASSWORD)
    const text = Buffer.from(envelope).toString('latin1')
    expect(text).not.toContain('SQLite format 3')
    expect(text).not.toContain('Daw Mya')
    // Decrypting with the right password yields the real database image.
    const { plaintext } = await decryptBackup(envelope, PASSWORD)
    expect(isSqliteBytes(plaintext)).toBe(true)
    expect(probeDatabase(plaintext).ok).toBe(true)
  })

  it('restore round-trip: restored data matches the original data', async () => {
    await createTestDatabase()
    const { farmerId } = seed(getDatabase())
    const originalBytes = exportDatabaseBytes()

    const envelope = await createBackupEnvelope(getDatabase(), PASSWORD)

    // Mutate "existing" data after the backup (simulating continued use).
    createFarmer(getDatabase(), { name: 'Post-Backup Farmer' })

    await restoreBackupFromBytes(getDatabase(), envelope, PASSWORD)

    // The live singleton now holds the restored image — byte-identical to the
    // original snapshot, post-backup mutation gone.
    expect(Buffer.from(exportDatabaseBytes()).equals(Buffer.from(originalBytes))).toBe(true)
    const restored = listPurchases(getDatabase(), { farmer_id: farmerId })
    expect(restored).toHaveLength(1)
    // Existing calculated values are restored exactly as saved (never recomputed).
    expect(restored[0].snapshot.total_amount).toBe(108000)
    expect(restored[0].snapshot.net_pound).toBe(485)
    expect(restored[0].snapshot.moisture_loss).toBe(20)
  })

  it('wrong password → rejected, existing data remains intact', async () => {
    await createTestDatabase()
    seed(getDatabase())
    const envelope = await createBackupEnvelope(getDatabase(), PASSWORD)
    const db = getDatabase()
    createFarmer(db, { name: 'Must Survive' })
    const before = exportDatabaseBytes()

    await expect(restoreBackupFromBytes(db, envelope, 'nope')).rejects.toBeInstanceOf(Error)
    // Nothing changed — the failed restore never touched the database.
    expect(Buffer.from(exportDatabaseBytes()).equals(Buffer.from(before))).toBe(true)
    expect(listPurchases(getDatabase())).toHaveLength(1)
  })

  it('corrupted backup → rejected, existing data remains intact', async () => {
    await createTestDatabase()
    seed(getDatabase())
    const envelope = await createBackupEnvelope(getDatabase(), PASSWORD)
    const corrupted = new Uint8Array(envelope)
    corrupted[corrupted.length - 5] ^= 0xff
    const db = getDatabase()
    const before = exportDatabaseBytes()

    await expect(restoreBackupFromBytes(db, corrupted, PASSWORD)).rejects.toBeInstanceOf(Error)
    expect(Buffer.from(exportDatabaseBytes()).equals(Buffer.from(before))).toBe(true)
  })

  it('non-database payload (valid envelope, junk inside) → rejected before swap', async () => {
    await createTestDatabase()
    seed(getDatabase())
    const db = getDatabase()
    const before = exportDatabaseBytes()
    // A valid envelope whose plaintext is NOT a SQLite image.
    const junkEnvelope = await encryptBackup(new TextEncoder().encode('definitely not sqlite'), PASSWORD)
    await expect(restoreBackupFromBytes(db, junkEnvelope, PASSWORD)).rejects.toThrow(/valid database/)
    expect(Buffer.from(exportDatabaseBytes()).equals(Buffer.from(before))).toBe(true)
  })

  it('reopened database from restored bytes keeps all user data (restart parity)', async () => {
    await createTestDatabase()
    seed(getDatabase())
    const envelope = await createBackupEnvelope(getDatabase(), PASSWORD)
    const { plaintext } = await decryptBackup(envelope, PASSWORD)

    // Simulate an app restart: close, reopen from the restored image.
    closeDatabase()
    await openDatabase({ bytes: plaintext })
    runMigrations(getDatabase()) // idempotent on a migrated image
    expect(listPurchases(getDatabase())).toHaveLength(1)
  })
})