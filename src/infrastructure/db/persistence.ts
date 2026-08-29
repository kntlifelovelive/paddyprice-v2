/**
 * Database byte-persistence — docs/ARCHITECTURE.md §3.4.1.
 *
 * Every write schedules a debounced persist of the whole SQLite byte image
 * through the `DbPersistenceAdapter` port (declared in `src/types`). The
 * platform backends (IndexedDB for desktop/web, Capacitor Filesystem for
 * Android) are separate future adapters; tests inject an in-memory adapter
 * here. No platform code and no business logic in this module.
 */
import type { DbPersistenceAdapter } from '@/types'
import { exportDatabaseBytes, isDatabaseOpen } from './connection'

/** Debounce window for scheduled saves (documented reference behavior). */
export const SAVE_DEBOUNCE_MS = 150

let adapter: DbPersistenceAdapter | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<void> = Promise.resolve()

/** Attach (or detach with `null`) the persistence adapter. Doubles as the test hook. */
export function setPersistenceAdapter(next: DbPersistenceAdapter | null): void {
  adapter = next
}

export function getPersistenceAdapter(): DbPersistenceAdapter | null {
  return adapter
}

function persistNow(): Promise<void> {
  const current = adapter
  if (!current || !isDatabaseOpen()) return Promise.resolve()
  return current.save(exportDatabaseBytes())
}

/** Queue a debounced persist of the database bytes (called after every write). */
export function scheduleSave(): void {
  if (!adapter) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void persistNow().catch(() => {
      // Scheduled saves are best-effort; flushSave() surfaces errors to callers.
    })
  }, SAVE_DEBOUNCE_MS)
}

/** Persist immediately (used before finalize/backup/restore). Resolves when written. */
export function flushSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saving = saving.then(persistNow, persistNow)
  return saving
}
