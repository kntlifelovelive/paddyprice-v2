/**
 * IndexedDB-based DbPersistenceAdapter — the concrete offline persistence backend
 * for desktop/web platforms (Capacitor Filesystem for Android is a future adapter).
 *
 * The database name is `'paddy-v2'` and the store key is `'db'` — one binary blob
 * containing the entire sql.js SQLite image.
 *
 * All operations are fire-and-forget reads / sequential writes. Only one save
 * runs at a time (enforced by callers via persistence.ts flushSave).
 */
const DB_NAME = 'paddy-v2'
const DB_VERSION = 1
const STORE_NAME = 'db'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const indexedDbAdapter = {
  name: 'IndexedDB',

  async load(): Promise<Uint8Array | null> {
    try {
      const db = await open()
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const req = store.get('db')
        req.onsuccess = () => {
          const data = req.result
          if (data instanceof Uint8Array) resolve(data)
          else if (data instanceof ArrayBuffer) resolve(new Uint8Array(data))
          else resolve(null)
        }
        req.onerror = () => resolve(null)
      })
    } catch {
      return null
    }
  },

  async save(data: Uint8Array): Promise<void> {
    try {
      const db = await open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const req = store.put(data, 'db')
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    } catch {
      // Best-effort: errors surface via the console only.
    }
  },
}
