/**
 * Platform gallery adapter (PNG export) — infrastructure layer.
 *
 * Saves a PNG image rendered from the report HTML into the device's image
 * gallery so it is visible in the Photos/Gallery app.
 *
 *   - native (Capacitor / Android): writes through a custom MediaStore plugin
 *     (`GallerySave`) into `Pictures/Paddy` — no storage permission needed on
 *     modern Android (scoped storage), appears in the Gallery automatically.
 *   - web: falls back to a browser download (there is no web gallery).
 *
 * Per the architecture rules this module is the ONLY place that touches the
 * Gallery/MediaStore boundary. The PNG service depends on it through the
 * `GalleryPort` contract and never branches on the platform itself.
 */

import { Capacitor } from '@capacitor/core'
import { registerPlugin } from '@capacitor/core'
import type { SavedFile } from '@/types/storage'

/**
 * Native GallerySave plugin interface (implemented in Java:
 * `android/app/src/main/java/com/paddy/paddyprice/GallerySavePlugin.java`).
 *
 * Writes the given PNG bytes (base64) into MediaStore under Pictures/Paddy.
 */
export interface GallerySavePluginInterface {
  save(options: { fileName: string; dataBase64: string }): Promise<SavedFile>
}

const GallerySave = registerPlugin<GallerySavePluginInterface>('GallerySave', {
  web: {
    async save(): Promise<SavedFile> {
      // No-op on web; the browser-download branch handles web PNG export.
      return { path: '' }
    }
  },
})

export interface GalleryPort {
  savePng(fileName: string, pngBytes: Uint8Array): Promise<SavedFile>
}

function pngBytesToBase64(data: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Browser-download fallback (web / desktop) — no native gallery exists. */
function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
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

const browserGallery: GalleryPort = {
  async savePng(fileName: string, pngBytes: Uint8Array): Promise<SavedFile> {
    const blob = new Blob([pngBytes], { type: 'image/png' })
    const filename = fileName.replace(/[\\/]/g, '_')
    triggerBrowserDownload(blob, filename)
    return { path: fileName }
  },
}

const nativeGallery: GalleryPort = {
  async savePng(fileName: string, pngBytes: Uint8Array): Promise<SavedFile> {
    const dataBase64 = pngBytesToBase64(pngBytes)
    return GallerySave.save({ fileName, dataBase64 })
  },
}

export function isNativePlatform(): boolean {
  // Reuse the same platform check the storage adapter uses.
  return Capacitor.isNativePlatform()
}

/**
 * Pick the correct GalleryPort for the CURRENT platform. The PNG service
 * consumes this through the contract and never branches on platform itself.
 */
export function createGallery(): GalleryPort {
  return isNativePlatform() ? nativeGallery : browserGallery
}

export type { SavedFile }
