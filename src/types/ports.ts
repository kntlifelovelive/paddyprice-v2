/**
 * Infrastructure ports — src/types foundation (Step 3).
 *
 * Type-only contracts (capabilities + data shapes only). No implementations,
 * no wiring, no DI. Concrete adapters are implemented later in
 * `src/infrastructure` (sql.js, Capacitor plugins, file system, printer
 * transports) and declare satisfaction of these interfaces. Infrastructure
 * may import `src/types` and `@/domain` types; nothing here imports
 * infrastructure, features, services, or the UI.
 */

import type { PurchaseSnapshot } from '@/domain/purchase/types'
import type { BagRow } from '@/domain/purchase/totals'

/* ------------------------------------------------------------------ */
/* Database / persistence                                              */
/* ------------------------------------------------------------------ */

/**
 * Persistence port for the SQLite database bytes.
 * Backends: IndexedDB (desktop/web) and Capacitor Filesystem (Android).
 * The database is always SQLite (sql.js); this adapter only decides where the
 * raw bytes live.
 */
export interface DbPersistenceAdapter {
  readonly name: string
  /** Load the raw SQLite bytes, or null when no database exists yet. */
  load(): Promise<Uint8Array | null>
  /** Persist the raw SQLite bytes. */
  save(data: Uint8Array): Promise<void>
}

/** A saved purchase plus its bag rows — the full aggregate a DAO/session returns. */
export interface PurchaseRecord {
  snapshot: PurchaseSnapshot
  bags: BagRow[]
}

/** Offers simple data-access convenience; DAOs in infrastructure implement the concrete reads. */
export interface PurchaseDaoPort {
  findByDateAndRiceType(date: string, rice_type_id: number): Promise<PurchaseSnapshot | null>
  findById(id: number): Promise<PurchaseRecord | null>
  // A DAO is intentionally kept minimal — richer queries live in `infrastructure/db/dao`.
}