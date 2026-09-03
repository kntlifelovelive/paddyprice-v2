/**
 * Platform filesystem adapter (Step 9) - infrastructure layer.
 *
 * The PDF service (and any later file-producing service) must NOT touch the
 * DOM / window directly. The PDF service calls this adapter through the
 * `StoragePort` contract (src/types/storage). This module is the minimal
 * browser-download implementation: a Blob is created and an <a download>
 * element is clicked. The Electron host (added in a later step) will
 * intercept the download to `~/PSO/{relative-path}`; the web/Android builds
 * will fall through to the browser's default download flow.
 *
 * IMPORTANT: this file lives in `infrastructure/platform` and is the ONLY
 * place browser/window APIs are allowed for file I/O. Services depend on
 * it through the type contract, never on its concrete functions.
 */

import type { SavedFile, StoragePort } from '@/types/storage'
import { Capacitor } from '@capacitor/core'

/**
 * Sanitize a path segment so it can be safely used as a filename.
 * Per REFERENCE_NOTES §4: keep Myanmar Unicode; strip `/\:*?"<>|` and trim
 * leading/trailing whitespace and dots. Returns 'file' for empty input.
 */
export function sanitizeSegment(value: string): string {
  const stripped = value.replace(/[\\/:*?"<>|]/g, '').replace(/^[\s.]+|[\s.]+$/g, '')
  return stripped.length === 0 ? 'file' : stripped
}

/**
 * Join path segments with `/` while keeping Myanmar Unicode characters.
 * The browser's download attribute needs forward slashes; the Electron
 * host converts them back to OS separators.
 */
export function joinPath(...segments: string[]): string {
  return segments
    .map((s) => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter((s) => s.length > 0)
    .join('/')
}

function triggerBrowserDownload(blob: Blob, filename: string): void {
  // jsdom (used in tests) does not implement anchor downloads; tests
  // bypass the real download path by injecting a custom storage adapter.
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Default browser-download StoragePort implementation.
 */
export const browserDownloadStorage: StoragePort = {
  async saveBinaryFile(relativePath: string, data: Uint8Array | Blob): Promise<SavedFile> {
    const blob = data instanceof Blob ? data : new Blob([new Uint8Array(data)], { type: 'application/pdf' })
    const filename = relativePath.split('/').map(sanitizeSegment).join('_')
    triggerBrowserDownload(blob, filename)
    return { path: relativePath }
  },
  async saveTextFile(relativePath: string, content: string, _mime: string): Promise<SavedFile> {
    const blob = new Blob([content], { type: _mime || 'text/plain' })
    const filename = relativePath.split('/').map(sanitizeSegment).join('_')
    triggerBrowserDownload(blob, filename)
    return { path: relativePath }
  },
  async pickAndReadFile(_accept: string): Promise<Uint8Array> {
    throw new Error('pickAndReadFile is not implemented in the browser-download adapter')
  },
}

/* ------------------------------------------------------------------ */
/* Android (Capacitor) PDF storage + open/share                         */
/* ------------------------------------------------------------------ */

/**
 * True when running inside the Capacitor native container (Android).
 * Same check the DB adapter uses (`infrastructure/platform/db`) — the
 * storage boundary is the ONLY place platform branching happens for output.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/** Convert a PDF byte array to base64 (chunked — mirrors platform/db adapter). */
function pdfBytesToBase64(data: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Write PDF bytes on Android via `@capacitor/filesystem` into the app's
 * Documents directory (durable, user-visible), then open the native
 * Share/Open-With sheet pointing at a `content://` URI of the same bytes.
 * Returns the `file://` URI of the persisted Documents copy.
 */
export async function saveAndShareAndroidPdf(
  relativePath: string,
  data: Uint8Array | Blob,
): Promise<SavedFile> {
  const filename = relativePath.split('/').map(sanitizeSegment).join('/')
  const cleanPath = filename.replace(/^\/+/, '')

  // 1) Durable copy → Documents/<relative path> (reference behavior).
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const dir = cleanPath.substring(0, cleanPath.lastIndexOf('/'))
  if (dir) {
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true })
    } catch {
      // Directory already exists.
    }
  }
  const base64 = data instanceof Blob ? await blobToBase64(data) : pdfBytesToBase64(data)
  const docWrite = await Filesystem.writeFile({
    path: cleanPath,
    directory: Directory.Documents,
    data: base64,
    recursive: true,
  })

  // 2) Shareable copy → Cache, whose `content://` URI the Share plugin can
  //    hand to other apps (file:// URIs are blocked on modern Android).
  const sharePath = `paddy-pdfs/${cleanPath.split('/').pop()}`
  try {
    await Filesystem.mkdir({ path: 'paddy-pdfs', directory: Directory.Cache, recursive: true })
  } catch {
    // Directory already exists.
  }
  await Filesystem.writeFile({
    path: sharePath,
    directory: Directory.Cache,
    data: base64,
    recursive: true,
  })
  const cache = await Filesystem.getUri({ path: sharePath, directory: Directory.Cache })

  // 3) Native Share / Open-With sheet (canonical Capacitor mechanism).
  try {
    const { Share } = await import('@capacitor/share')
    await Share.share({
      title: (cleanPath.split('/').pop() ?? 'purchase') + ' — Paddy',
      text: cleanPath.split('/').pop() ?? 'Paddy PDF',
      url: cache.uri, // content:// URI from Capacitor's FileProvider
      dialogTitle: 'Open or share PDF',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Dismissing the native share sheet is NOT a failure — the durable
    // Documents copy above is already saved (Capacitor Share v8 rejects with
    // exactly "Share canceled" on Activity.RESULT_CANCELED). Only genuine
    // share failures are surfaced to the caller.
    if (/cancel/i.test(message)) {
      return { path: docWrite.uri }
    }
    throw new Error(`PDF saved to Documents, but opening it failed: ${message}`)
  }

  return { path: docWrite.uri }
}

/**
 * Android (Capacitor) PDF StoragePort — writes + shares via the native
 * Filesystem/Share plugins. Only ever constructed on a native platform.
 */
export const capacitorPdfStorage: StoragePort = {
  async saveBinaryFile(relativePath: string, data: Uint8Array | Blob): Promise<SavedFile> {
    return saveAndShareAndroidPdf(relativePath, data)
  },
  async saveTextFile(relativePath: string, content: string, _mime: string): Promise<SavedFile> {
    const blob = new Blob([content], { type: _mime || 'text/plain' })
    return saveAndShareAndroidPdf(relativePath, blob)
  },
  async pickAndReadFile(_accept: string): Promise<Uint8Array> {
    throw new Error('pickAndReadFile is not implemented in the Capacitor PDF adapter')
  },
}

/** Blob → base64 (used by the Android adapter). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Pick the correct StoragePort for the CURRENT platform:
 *  - native (Capacitor / Android): writes + opens/shares via the filesystem;
 *  - web/desktop: the existing browser-download adapter (unchanged behavior).
 * The PDF service consumes this through the StoragePort contract and never
 * branches on the platform itself.
 */
export function createPdfStorage(): StoragePort {
  return isNativePlatform() ? capacitorPdfStorage : browserDownloadStorage
}

export type { StoragePort, SavedFile }
