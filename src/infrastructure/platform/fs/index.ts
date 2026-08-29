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

export type { StoragePort, SavedFile }
