/**
 * Platform storage / filesystem port — src/types foundation (Step 3).
 *
 * Where files (PDFs, exports, backups) are written and read. Concrete
 * adapters: browser downloads (which Electron intercepts to `~/PSO/pdf`,
 * `~/PSO/backup`, rest → `~/Downloads`), Android app Documents directory via
 * Capacitor Filesystem, and file pickers for restore.
 */

/** A file saved through the platform storage layer. */
export interface SavedFile {
  /** Platform-specific path or URI where the file was written. */
  path: string
}

/**
 * Port for saving binary/text data under a relative path like
 * "pdf/2026/07/x.pdf", and for reading a user-picked file back (restore).
 */
export interface StoragePort {
  saveBinaryFile(relativePath: string, data: Uint8Array | Blob): Promise<SavedFile>
  saveTextFile(relativePath: string, content: string, mime: string): Promise<SavedFile>
  /** Let the user pick a file and return its bytes (e.g. `.ppbak`/`.sqlite/.db` restore). */
  pickAndReadFile(accept: string): Promise<Uint8Array>
}