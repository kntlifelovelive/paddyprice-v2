/**
 * Native (Capacitor, i.e. Android) database persistence — infrastructure
 * platform layer (AGENTS §10: platform-specific code lives ONLY here).
 *
 * The database is always real SQLite via sql.js; a `DbPersistenceAdapter`
 * (src/types/ports.ts) only decides WHERE the raw SQLite bytes live:
 *
 *  - Android (native Capacitor): app-data file `sqlite/paddy-v2.sqlite`
 *    via @capacitor/filesystem `Directory.Data` — durable across app
 *    restarts (Android WebView IndexedDB is best-effort storage the system
 *    may evict, so the native platform MUST use the filesystem, matching
 *    the reference project's `CapacitorFsAdapter`).
 *  - Web / desktop: IndexedDB (handled by `infrastructure/db/init.ts` via
 *    the existing `indexedDbAdapter`; behavior unchanged).
 *
 * No business logic, no platform branching outside this module:
 * `createDbPersistenceAdapter()` returns the native adapter on native
 * platforms and `null` otherwise; the db init layer falls back to IndexedDB.
 */
import { Capacitor } from '@capacitor/core'
import type { DbPersistenceAdapter } from '@/types'

const NATIVE_DB_DIR = 'sqlite'
const NATIVE_DB_FILE = 'paddy-v2.sqlite'

/**
 * bytes → base64. Chunked so large database images never blow the
 * `String.fromCharCode` call-stack limit.
 */
export function bytesToBase64(data: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** base64 → bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function ensureDir(): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  try {
    await Filesystem.mkdir({
      path: NATIVE_DB_DIR,
      directory: Directory.Data,
      recursive: true,
    })
  } catch {
    // Directory already exists.
  }
}

/** Native persistence adapter: the SQLite image as a base64 app-data file. */
export const capacitorFsDbAdapter: DbPersistenceAdapter = {
  name: 'capacitor-fs',

  async load(): Promise<Uint8Array | null> {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem')
      const result = await Filesystem.readFile({
        path: `${NATIVE_DB_DIR}/${NATIVE_DB_FILE}`,
        directory: Directory.Data,
      })
      if (typeof result.data === 'string') return base64ToBytes(result.data)
      if (result.data instanceof Blob) return new Uint8Array(await result.data.arrayBuffer())
      return new Uint8Array(result.data)
    } catch {
      // First run (or unreadable file) → start from an empty database.
      return null
    }
  },

  async save(data: Uint8Array): Promise<void> {
    await ensureDir()
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: `${NATIVE_DB_DIR}/${NATIVE_DB_FILE}`,
      directory: Directory.Data,
      data: bytesToBase64(data),
    })
  },
}

/** True when running inside the Capacitor native container (Android). */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Platform adapter selection: the native Capacitor Filesystem adapter on
 * Android, `null` on web/desktop (caller falls back to IndexedDB). Returns a
 * shared `DbPersistenceAdapter` — the moisture/purchase business logic never
 * branches on the platform.
 */
export function createDbPersistenceAdapter(): DbPersistenceAdapter | null {
  return isNativePlatform() ? capacitorFsDbAdapter : null
}